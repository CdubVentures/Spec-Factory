/**
 * Eval Record — enriched eval history contract tests.
 *
 * Covers: appendEvalRecord field enrichment (new fields matching run history),
 * backward compat with legacy records, and deleteEvalRecord behavior.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { appendEvalRecord, deleteEvalRecord } from '../imageEvaluator.js';

const TMP = path.join(os.tmpdir(), `eval-record-test-${Date.now()}`);
const PRODUCT_ID = 'p1';
const PRODUCT_ROOT = TMP;

function docPath() {
  return path.join(TMP, PRODUCT_ID, 'product_images.json');
}

function readDoc() {
  return JSON.parse(fs.readFileSync(docPath(), 'utf8'));
}

function writeDoc(overrides = {}) {
  const doc = {
    product_id: PRODUCT_ID,
    category: 'mouse',
    selected: {
      images: [
        { view: 'top', filename: 'top-black.png', variant_id: 'v_abc12345', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
      ],
    },
    cooldown_until: '',
    last_ran_at: '',
    run_count: 1,
    next_run_number: 2,
    runs: [],
    evaluations: [],
    ...overrides,
  };
  const dir = path.join(TMP, PRODUCT_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(docPath(), JSON.stringify(doc, null, 2));
}

before(() => fs.mkdirSync(TMP, { recursive: true }));
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

/* ── appendEvalRecord: enriched fields ──────────────────────────── */

describe('appendEvalRecord — enriched fields', () => {
  beforeEach(() => writeDoc());

  it('persists started_at timestamp', () => {
    const startedAt = '2025-06-01T12:00:00.000Z';
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: { system: 'sys', user: 'usr' },
      response: {},
      result: { rankings: [] },
      startedAt,
    });
    assert.equal(record.started_at, startedAt);
    const doc = readDoc();
    assert.equal(doc.evaluations[0].started_at, startedAt);
  });

  it('persists effort_level', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      effortLevel: 'high',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.effort_level, 'high');
    const doc = readDoc();
    assert.equal(doc.evaluations[0].effort_level, 'high');
  });

  it('persists access_mode', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      accessMode: 'lab',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.access_mode, 'lab');
    const doc = readDoc();
    assert.equal(doc.evaluations[0].access_mode, 'lab');
  });

  it('persists fallback_used', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      fallbackUsed: true,
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.fallback_used, true);
    const doc = readDoc();
    assert.equal(doc.evaluations[0].fallback_used, true);
  });

  it('persists variant_label', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      variantLabel: 'Black',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.variant_label, 'Black');
    const doc = readDoc();
    assert.equal(doc.evaluations[0].variant_label, 'Black');
  });

  it('persists variant_type', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      variantType: 'color',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.variant_type, 'color');
    const doc = readDoc();
    assert.equal(doc.evaluations[0].variant_type, 'color');
  });

  it('persists duration_ms', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      durationMs: 1234,
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.duration_ms, 1234);
  });

  it('persists all enriched fields together', () => {
    const startedAt = '2025-06-01T12:00:00.000Z';
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'edition:cod-bo6',
      type: 'hero',
      view: null,
      model: 'claude-sonnet-4-5-20250514',
      startedAt,
      effortLevel: 'xhigh',
      accessMode: 'api',
      fallbackUsed: false,
      variantLabel: 'CoD BO6 Edition',
      variantType: 'edition',
      durationMs: 5678,
      prompt: { system: 'hero sys', user: 'hero usr' },
      response: { heroes: [] },
      result: { heroes: [] },
    });
    assert.equal(record.started_at, startedAt);
    assert.equal(record.effort_level, 'xhigh');
    assert.equal(record.access_mode, 'api');
    assert.equal(record.fallback_used, false);
    assert.equal(record.variant_label, 'CoD BO6 Edition');
    assert.equal(record.variant_type, 'edition');
    assert.equal(record.duration_ms, 5678);
    assert.equal(record.type, 'hero');
    assert.equal(record.view, null);
    assert.equal(record.model, 'claude-sonnet-4-5-20250514');
  });
});

/* ── appendEvalRecord: defaults / backward compat ───────────────── */

describe('appendEvalRecord — defaults for missing fields', () => {
  beforeEach(() => writeDoc());

  it('defaults started_at to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.started_at, null);
  });

  it('defaults effort_level to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.effort_level, null);
  });

  it('defaults access_mode to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.access_mode, null);
  });

  it('defaults fallback_used to false when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.fallback_used, false);
  });

  it('defaults variant_label to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.variant_label, null);
  });

  it('defaults variant_type to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.variant_type, null);
  });

  it('defaults duration_ms to null when omitted', () => {
    const record = appendEvalRecord({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      type: 'view',
      view: 'top',
      model: 'gpt-4o',
      prompt: {},
      response: {},
      result: {},
    });
    assert.equal(record.duration_ms, null);
  });
});

/* ── appendEvalRecord: existing behavior preserved ──────────────── */

describe('appendEvalRecord — existing behavior', () => {
  beforeEach(() => writeDoc());

  it('increments eval_number sequentially', () => {
    appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'm1',
      prompt: {}, response: {}, result: {},
    });
    const r2 = appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'left', model: 'm2',
      prompt: {}, response: {}, result: {},
    });
    assert.equal(r2.eval_number, 2);
    const doc = readDoc();
    assert.equal(doc.evaluations.length, 2);
    assert.equal(doc.evaluations[0].eval_number, 1);
    assert.equal(doc.evaluations[1].eval_number, 2);
  });

  it('sets ran_at to a valid ISO timestamp', () => {
    const before = Date.now();
    const record = appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'gpt-4o',
      prompt: {}, response: {}, result: {},
    });
    const after = Date.now();
    const ranAt = new Date(record.ran_at).getTime();
    assert.ok(ranAt >= before && ranAt <= after, 'ran_at should be current timestamp');
  });

  it('returns null when product doc does not exist', () => {
    const result = appendEvalRecord({
      productId: 'nonexistent', productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'gpt-4o',
      prompt: {}, response: {}, result: {},
    });
    assert.equal(result, null);
  });

  it('initializes evaluations array if missing from doc', () => {
    writeDoc({ evaluations: undefined });
    const record = appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'gpt-4o',
      prompt: {}, response: {}, result: {},
    });
    assert.equal(record.eval_number, 1);
    const doc = readDoc();
    assert.ok(Array.isArray(doc.evaluations));
    assert.equal(doc.evaluations.length, 1);
  });
});

/* ── deleteEvalRecord: existing behavior preserved ──────────────── */

describe('deleteEvalRecord — preserves existing behavior', () => {
  beforeEach(() => writeDoc());

  it('removes the specified eval record by eval_number', () => {
    appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'm',
      prompt: {}, response: {}, result: {},
    });
    appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'left', model: 'm',
      prompt: {}, response: {}, result: {},
    });
    deleteEvalRecord({ productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, evalNumber: 1 });
    const doc = readDoc();
    assert.equal(doc.evaluations.length, 1);
    assert.equal(doc.evaluations[0].eval_number, 2);
  });

  it('clears view eval fields when deleting a view eval record', () => {
    const images = [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black', eval_best: true, eval_flags: [], eval_reasoning: 'good' },
      { view: 'left', filename: 'left-black.png', variant_key: 'color:black', eval_best: true },
    ];
    writeDoc({ selected: { images } });
    appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'view', view: 'top', model: 'm',
      prompt: {}, response: {}, result: {},
    });
    deleteEvalRecord({ productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, evalNumber: 1 });
    const doc = readDoc();
    const topImg = doc.selected.images.find(i => i.view === 'top');
    const leftImg = doc.selected.images.find(i => i.view === 'left');
    assert.equal(topImg.eval_best, undefined, 'top eval fields cleared');
    assert.equal(topImg.eval_reasoning, undefined, 'top reasoning cleared');
    assert.equal(leftImg.eval_best, true, 'left eval fields preserved');
  });

  it('clears hero fields when deleting a hero eval record', () => {
    const images = [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black', hero: true, hero_rank: 1 },
      { view: 'top', filename: 'top-red.png', variant_key: 'color:red', hero: true, hero_rank: 1 },
    ];
    writeDoc({ selected: { images } });
    appendEvalRecord({
      productId: PRODUCT_ID, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black', type: 'hero', model: 'm',
      prompt: {}, response: {}, result: {},
    });
    deleteEvalRecord({ productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, evalNumber: 1 });
    const doc = readDoc();
    const blackImg = doc.selected.images.find(i => i.variant_key === 'color:black');
    const redImg = doc.selected.images.find(i => i.variant_key === 'color:red');
    assert.equal(blackImg.hero, undefined, 'black hero cleared');
    assert.equal(blackImg.hero_rank, undefined, 'black hero_rank cleared');
    assert.equal(redImg.hero, true, 'red hero preserved');
  });

  it('returns null for nonexistent eval_number', () => {
    const result = deleteEvalRecord({ productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, evalNumber: 999 });
    assert.equal(result, null);
  });
});

/* ── carouselBuild passes enriched fields to appendEvalRecord ───── */

describe('carouselBuild — passes enriched fields through', () => {
  // WHY: These tests verify that runEvalView and runEvalHero pass the
  // new enriched fields (variant_label, variant_type, etc.) when calling
  // appendEvalRecord. We can't test the real appendEvalRecord call from
  // carouselBuild without an LLM, but we can verify the _prompt field
  // is set (which triggers the appendEvalRecord path) and that the
  // variant info is correctly resolved from image metadata.

  beforeEach(() => {
    const images = [
      {
        view: 'top', filename: 'top-black.png', variant_key: 'color:black',
        variant_label: 'Black', variant_type: 'color',
        url: 'https://example.com/top.png', quality_pass: true,
      },
      {
        view: 'top', filename: 'top-black-2.png', variant_key: 'color:black',
        variant_label: 'Black', variant_type: 'color',
        url: 'https://example.com/top2.png', quality_pass: true,
      },
    ];
    writeDoc({ selected: { images } });
  });

  it('runEvalView passes variantLabel from image metadata to eval function', async () => {
    const { runEvalView } = await import('../carouselBuild.js');
    let capturedLabel = null;
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: { getFinderStore: () => ({ getSetting: () => '', updateSummaryField: () => {} }) },
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: PRODUCT_ROOT,
      _evalViewFn: async (opts) => {
        capturedLabel = opts.variantLabel;
        return { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' }] };
      },
      _mergeFn: () => ({}),
    });
    assert.equal(capturedLabel, 'Black');
  });
});
