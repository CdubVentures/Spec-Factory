// Per-scenario isolation + helpers. Each audit scenario gets its own
// throwaway productRoot, in-memory SpecDb, and AppDb stub so scenarios
// cannot leak state across each other.
//
// Structure mirrors src/features/color-edition/tests/variantLifecycle.test.js:8-61
// (withEnv) and src/features/color-edition/tests/colorEditionFinder.test.js:18-24
// (makeAppDbStub).

import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../src/db/specDb.js';
import { AUDIT_PALETTE } from './fixtures/palette.js';
import { buildCompiledRules } from './fixtures/compiledRules.js';

const AUDIT_ROOT = path.join('.tmp', 'feature-audit', 'cef');

export function buildTestEnv(scenarioId) {
  fs.mkdirSync(AUDIT_ROOT, { recursive: true });
  const productRoot = path.join(AUDIT_ROOT, `${scenarioId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(productRoot, { recursive: true });

  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.upsertCompiledRules(JSON.stringify(buildCompiledRules()), JSON.stringify({}));

  const appDb = {
    listColors: () => [...AUDIT_PALETTE],
  };

  function ensureProductJson(productId, identity = {}) {
    const dir = path.join(productRoot, productId);
    fs.mkdirSync(dir, { recursive: true });
    const doc = {
      schema_version: 2,
      checkpoint_type: 'product',
      product_id: productId,
      category: 'mouse',
      identity: {
        brand: identity.brand || 'TestBrand',
        model: identity.model || 'TestModel',
        ...identity,
      },
      sources: [],
      fields: {},
    };
    fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(doc, null, 2));
  }

  function readCef(productId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(productRoot, productId, 'color_edition.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  function seedPif(productId, doc) {
    const dir = path.join(productRoot, productId);
    fs.mkdirSync(dir, { recursive: true });
    const base = {
      product_id: productId,
      category: 'mouse',
      selected: { images: [] },
      carousel_slots: {},
      evaluations: [],
      runs: [],
      run_count: 0,
      next_run_number: 1,
      last_ran_at: '',
      ...doc,
    };
    fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(base, null, 2));
  }

  function readPif(productId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(productRoot, productId, 'product_images.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  function cleanup() {
    try { specDb.close(); } catch { /* noop */ }
    // WHY: Keep the productRoot on disk for postmortem inspection.
    // run.js prints the path so the user can open it if a scenario fails.
  }

  return {
    productRoot,
    specDb,
    appDb,
    ensureProductJson,
    readCef,
    seedPif,
    readPif,
    cleanup,
  };
}

// Convenience helper for building canned LLM response stubs.
// Returns an async function matching the _callLlmOverride contract:
//   (domainArgs, { onModelResolved }) => Promise<{ result, usage }>
export function cannedLlm(payload) {
  return async () => ({ result: payload, usage: null });
}
