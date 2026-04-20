// WHY: runColorEditionFinder builds the stored "prompt snapshot" twice —
// once via buildColorEditionFinderPrompt(...) for onLlmCallComplete and the
// color_edition.json run record, and a second time (with a different arg set)
// via the LLM adapter's system function when the actual LLM call fires.
// A regression was shipped where the snapshot builder forgot to pass
// familyModelCount / ambiguityLevel / siblingModels, so the stored prompt
// always showed the easy-tier "no known siblings" warning even on
// multi-model families. The live LLM still saw the correct CAUTION prompt
// (proved via llm_call_started prompt_preview logs), but the GUI operations
// modal and color_edition.json both showed the wrong text.
//
// This test locks down both paths: the onLlmCallComplete snapshot AND the
// persisted run prompt must contain the CAUTION medium-tier warning and
// the "This product is NOT: <siblings>" exclusion line when the product
// has 3 sibling models in specDb.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { readColorEdition } from '../colorEditionStore.js';

const TMP_ROOT = path.join('.tmp', '_test_cef_prompt_snapshot');
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

const COLORS_RULE = {
  contract: { shape: 'list', type: 'string', list_rules: { dedupe: true, item_union: 'set_union', sort: 'none' } },
  parse: { template: 'list_of_tokens_delimited', delimiters: [',', '/', '|', ';'], token_map: {} },
  enum: { policy: 'closed', match: { strategy: 'exact' }, source: 'data_lists.colors' },
};
const EDITIONS_RULE = { contract: { shape: 'list', type: 'string' }, parse: { template: null }, enum: { policy: 'open', match: { strategy: 'exact' } }, priority: {} };

function seedRules(specDb) {
  specDb.upsertCompiledRules(JSON.stringify({
    fields: { colors: COLORS_RULE, editions: EDITIONS_RULE },
    known_values: { colors: { policy: 'closed', values: ['black', 'white'] } },
  }), JSON.stringify({}));
}

function seedFamily(specDb) {
  // WHY: three sibling products under Corsair M75 so resolveIdentityAmbiguitySnapshot
  // returns family_model_count=3, ambiguity_level='medium',
  // sibling_models=['M75','M75 Wireless'] (from the M75 Air Wireless POV).
  specDb.upsertProduct({ product_id: 'mouse-target', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless', status: 'active' });
  specDb.upsertProduct({ product_id: 'mouse-sib-1', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75', variant: '', status: 'active' });
  specDb.upsertProduct({ product_id: 'mouse-sib-2', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Wireless', variant: 'Wireless', status: 'active' });
}

function ensureProductJson(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    schema_version: 2, checkpoint_type: 'product', product_id: productId,
    category: 'mouse',
    identity: { brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless' },
    sources: [], fields: {},
  }));
}

const appDb = { listColors: () => [{ name: 'black', hex: '#000', css_var: '--black' }, { name: 'white', hex: '#fff', css_var: '--white' }] };

const LLM_RESPONSE = {
  colors: [{ name: 'black', confidence: 85, evidence_refs: [{ url: 'https://corsair.com/x', tier: 'tier1', confidence: 90 }] }],
  editions: {},
  default_color: 'black',
  siblings_excluded: [],
  discovery_log: { confirmed_from_known: [], added_new: ['black'], rejected_from_known: [], urls_checked: ['https://corsair.com/x'], queries_run: ['corsair m75 air colors'] },
};

describe('CEF prompt snapshot — family context propagation', () => {
  let specDb;

  before(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(DB_DIR, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
    seedRules(specDb);
    seedFamily(specDb);
  });

  after(() => {
    specDb.close();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('onLlmCallComplete prompt snapshot contains CAUTION + sibling exclusion when family=3', async () => {
    const pid = 'mouse-target';
    ensureProductJson(pid);

    const capturedCalls = [];
    await runColorEditionFinder({
      product: { product_id: pid, category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless' },
      appDb, specDb, config: {}, productRoot: PRODUCT_ROOT,
      onLlmCallComplete: (call) => capturedCalls.push(call),
      _callLlmOverride: async () => ({ result: LLM_RESPONSE, usage: null }),
    });

    assert.ok(capturedCalls.length > 0, 'expected at least one onLlmCallComplete');
    const snapshotPrompt = capturedCalls[0].prompt?.system || '';
    assert.match(snapshotPrompt, /CAUTION: This product has 3 models in its family\./, 'snapshot must contain CAUTION medium-tier warning');
    assert.match(snapshotPrompt, /This product is NOT: M75, M75 Wireless\./, 'snapshot must contain sibling exclusion line');
    assert.doesNotMatch(snapshotPrompt, /no known siblings — standard identity matching/, 'snapshot must NOT contain easy-tier fallback');
  });

  it('persisted run record in color_edition.json also contains CAUTION + sibling exclusion', async () => {
    const pid = 'mouse-target';
    const stored = readColorEdition({ productRoot: PRODUCT_ROOT, productId: pid });
    assert.ok(stored, 'expected color_edition.json to exist');
    const run = (stored.runs || []).find(r => r.run_number === 1);
    assert.ok(run, 'expected run 1 to be persisted');
    const system = run.prompt?.system || run.prompt?.discovery?.system || '';
    assert.ok(system, 'expected system prompt to be persisted');
    assert.match(system, /CAUTION: This product has 3 models in its family\./, 'persisted run must contain CAUTION');
    assert.match(system, /This product is NOT: M75, M75 Wireless\./, 'persisted run must contain sibling exclusion line');
  });
});
