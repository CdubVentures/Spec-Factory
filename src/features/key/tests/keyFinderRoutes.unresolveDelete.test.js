/**
 * keyFinder route — per-key Unresolve + Delete contract.
 *
 * Two new endpoints exposed by the KeyRow actions column:
 *   POST   /key-finder/:category/:productId/keys/:fieldKey/unpublish
 *   DELETE /key-finder/:category/:productId/keys/:fieldKey
 *
 * Unresolve = demote resolved→candidate + clear selected.keys[fk]. Candidates,
 * evidence, discovery history, and run records all preserved. Reversible via
 * the next run.
 *
 * Delete = unresolve + strip every keyFinder source from candidates (cascades
 * evidence via FK) + scrub fk from all runs' selected.keys/response.results.
 * Run records themselves stay as audit trail (matches existing DELETE /:pid
 * semantics).
 *
 * Both return 409 key_busy when an op is registered as primary or passenger
 * for (productId, fieldKey), to prevent racing a running Run/Loop.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerKeyFinderRoutes } from '../api/keyFinderRoutes.js';
import { mergeKeyFinderDiscovery, readKeyFinder } from '../keyStore.js';
import { initOperationsRegistry } from '../../../core/operations/index.js';
import { DATA_CHANGE_EVENT_NAMES } from '../../../core/events/dataChangeContract.js';
import * as keyFinderRegistry from '../../../core/operations/keyFinderRegistry.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const COMPILED_RULES = {
  fields: {
    polling_rate:       { field_key: 'polling_rate',       group: 'sensor_performance' },
    sensor_model:       { field_key: 'sensor_model',       group: 'sensor_performance' },
    wireless_technology:{ field_key: 'wireless_technology',group: 'connectivity' },
  },
};

const PRODUCT_ROW = {
  product_id: 'kf-ud-001',
  category: 'mouse',
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
};

const TMP_ROOT = path.join(os.tmpdir(), `kf-unresolve-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanupTmp() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}

function ensureProductDir(pid) {
  fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });
}

/**
 * Seed one keyFinder run with the given primary + optional passengers. The
 * passengers land in run.selected.keys (primary + each passenger) and
 * run.response.results (primary only by default — pass `passengerResults` to
 * populate those too).
 */
function seedRun({ pid, runNumber, primary, passengers = [], passengerResults = false, ranAt }) {
  const selected = { keys: {} };
  const results = {};
  const addKey = (fk) => {
    selected.keys[fk] = {
      value: `v-${fk}`,
      confidence: 88,
      evidence_refs: [{ url: `https://example.com/${fk}`, tier: 'tier_1' }],
      discovery_log: {
        urls_checked: [`https://example.com/${fk}`],
        queries_run: [`q for ${fk}`],
        notes: [`note for ${fk}`],
      },
    };
  };
  addKey(primary);
  results[primary] = {
    value: `v-${primary}`,
    confidence: 88,
    unknown_reason: '',
    evidence_refs: [{ url: `https://example.com/${primary}`, tier: 'tier_1' }],
    discovery_log: {
      urls_checked: [`https://example.com/${primary}`],
      queries_run: [`q for ${primary}`],
      notes: [`note for ${primary}`],
    },
  };
  for (const p of passengers) {
    addKey(p);
    if (passengerResults) {
      results[p] = {
        value: `v-${p}`,
        confidence: 80,
        unknown_reason: '',
        evidence_refs: [{ url: `https://example.com/${p}`, tier: 'tier_1' }],
        discovery_log: {
          urls_checked: [`https://example.com/${p}`],
          queries_run: [`q for ${p}`],
          notes: [`note for ${p}`],
        },
      };
    }
  }

  mergeKeyFinderDiscovery({
    productId: pid,
    productRoot: PRODUCT_ROOT,
    newDiscovery: { category: 'mouse', last_ran_at: ranAt || `2026-04-22T10:0${runNumber}:00Z` },
    run: {
      run_number: runNumber,
      started_at: ranAt || `2026-04-22T10:0${runNumber}:00Z`,
      duration_ms: 1000,
      model: 'gpt-5.4-mini',
      fallback_used: false,
      thinking: true,
      web_search: true,
      effort_level: 'xhigh',
      access_mode: 'api',
      selected,
      prompt: { system: 's', user: 'u' },
      response: {
        primary_field_key: primary,
        results,
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      },
    },
  });
}

/**
 * specDb stub — tracks demote + candidate-strip side effects so tests can
 * assert them. `candidates` is a map of fieldKey → array of candidate rows;
 * stripRunSourceFromCandidates mutates it via deleteFieldCandidatesBySourceType.
 */
function makeSpecDbStub({ candidates = new Map(), hasResolved = false } = {}) {
  const demoteCalls = [];
  const stripCalls = [];
  const finderRunDeletes = [];
  return {
    category: 'mouse',
    getCompiledRules: () => COMPILED_RULES,
    getProduct: () => PRODUCT_ROW,
    variants: {
      listActive: () => [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
    },
    getFieldCandidatesByProductAndField: (pid, fk) => candidates.get(fk) || [],
    getResolvedFieldCandidate: () => (hasResolved ? { value: 'v-selected' } : null),
    demoteResolvedCandidates: (pid, fk) => {
      demoteCalls.push({ pid, fk });
      // Simulate status flip — strip resolved rows out of the set
      const rows = candidates.get(fk) || [];
      candidates.set(fk, rows.map((r) => (r.status === 'resolved' ? { ...r, status: 'candidate' } : r)));
    },
    deleteFieldCandidatesBySourceType: (pid, fk, sourceType) => {
      stripCalls.push({ pid, fk, sourceType });
      const rows = candidates.get(fk) || [];
      candidates.set(fk, rows.filter((r) => r.source_type !== sourceType));
    },
    deleteFieldCandidateByValue: () => {},
    deleteFieldCandidateBySourceId: () => {},
    upsertFieldCandidate: () => {},
    deleteFinderRun: (finderId, pid, runNumber) => {
      finderRunDeletes.push(runNumber);
    },
    // Telemetry stubs (incidental reads from summary code paths we don't hit,
    // but keep defined so shared helpers don't choke on undefined fns)
    getFinderStore: () => null,
    _test: { demoteCalls, stripCalls, finderRunDeletes, candidates },
  };
}

function makeCtx({ specDb } = {}) {
  const responses = [];
  const broadcasts = [];
  const broadcastWs = (channel, data) => broadcasts.push({ channel, data });
  const ctx = {
    jsonRes: (_res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async (req) => req?.body || {},
    config: { productRoot: PRODUCT_ROOT },
    appDb: null,
    getSpecDb: () => specDb,
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses, broadcasts };
}

// ── Tests ────────────────────────────────────────────────────────────

it('key-finder-field-deleted event is registered for data-change propagation', () => {
  assert.ok(
    DATA_CHANGE_EVENT_NAMES.includes('key-finder-field-deleted'),
    'key delete events must be registered so every tab invalidates Key Finder data immediately',
  );
});

describe('POST /key-finder/:cat/:pid/keys/:fk/unpublish', () => {
  beforeEach(() => {
    keyFinderRegistry._resetForTest();
    cleanupTmp();
    ensureProductDir(PRODUCT_ROW.product_id);
  });

  it('happy path: demotes resolved candidates + clears selected.keys[fk] + emits event', async () => {
    const pid = PRODUCT_ROW.product_id;
    // seedRun populates doc.selected.keys[primary] via latest-run-wins
    seedRun({ pid, runNumber: 1, primary: 'polling_rate' });

    const candidates = new Map([
      ['polling_rate', [
        { value: '1000', status: 'resolved', source_type: 'key_finder' },
        { value: '500', status: 'candidate', source_type: 'key_finder' },
      ]],
    ]);
    const specDb = makeSpecDbStub({ candidates });
    const { ctx, responses, broadcasts } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate', 'unpublish'],
      null,
      'POST',
      { body: {} },
      {},
    );

    // Response
    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok, `expected 200, got ${JSON.stringify(responses)}`);
    assert.equal(ok.body.status, 'unpublished');
    assert.equal(ok.body.field_key, 'polling_rate');

    // DB side: demote was called
    assert.deepEqual(specDb._test.demoteCalls, [{ pid, fk: 'polling_rate' }]);

    // JSON side: selected.keys[fk] gone, but run + discovery preserved
    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.selected?.keys?.polling_rate, undefined, 'selected.keys[fk] cleared');
    assert.equal(doc.runs.length, 1, 'run preserved');
    assert.equal(doc.runs[0].response.primary_field_key, 'polling_rate');
    assert.ok(doc.runs[0].response.results.polling_rate, 'run response results preserved');

    // Event emitted
    const evt = broadcasts.find((b) => b.data?.event === 'key-finder-unpublished');
    assert.ok(evt, `expected key-finder-unpublished broadcast; got ${JSON.stringify(broadcasts.map((b) => b.data?.event))}`);
    assert.equal(evt.data.meta.field_key, 'polling_rate');
    assert.equal(evt.data.meta.productId, pid);
    assert.deepEqual(evt.data.entities.fieldKeys, ['polling_rate']);
  });

  it('idempotent: no resolved + no selected entry → 200 no-op', async () => {
    const pid = PRODUCT_ROW.product_id;
    ensureProductDir(pid);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate', 'unpublish'],
      null,
      'POST',
      { body: {} },
      {},
    );

    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok, `expected 200 on no-op, got ${JSON.stringify(responses)}`);
    assert.equal(ok.body.status, 'unpublished');
  });

  it('busy: in-flight primary → 409 key_busy (no mutation)', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'polling_rate' });

    keyFinderRegistry.register(pid, 'polling_rate', 'primary');

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate', 'unpublish'],
      null,
      'POST',
      { body: {} },
      {},
    );

    const err = responses.find((r) => r.status === 409);
    assert.ok(err, `expected 409, got ${JSON.stringify(responses)}`);
    assert.equal(err.body.error, 'key_busy');

    // No demote call
    assert.equal(specDb._test.demoteCalls.length, 0);

    // selected.keys[fk] still present
    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(doc.selected?.keys?.polling_rate, 'selected.keys[fk] untouched on busy');
  });

  it('busy: in-flight passenger → 409 key_busy', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'sensor_model' });

    keyFinderRegistry.register(pid, 'sensor_model', 'passenger');

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'sensor_model', 'unpublish'],
      null,
      'POST',
      { body: {} },
      {},
    );

    const err = responses.find((r) => r.status === 409);
    assert.ok(err);
    assert.equal(err.body.error, 'key_busy');
    assert.equal(specDb._test.demoteCalls.length, 0);
  });

  it('preserves candidates + runs (keeps discovery for next run)', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'polling_rate', passengers: ['sensor_model'] });
    seedRun({ pid, runNumber: 2, primary: 'polling_rate' });

    const candidates = new Map([
      ['polling_rate', [
        { value: '1000', status: 'resolved', source_type: 'key_finder' },
        { value: '500', status: 'candidate', source_type: 'key_finder' },
        { value: '8000', status: 'candidate', source_type: 'key_finder' },
      ]],
    ]);
    const specDb = makeSpecDbStub({ candidates });
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate', 'unpublish'],
      null,
      'POST',
      { body: {} },
      {},
    );

    assert.ok(responses.find((r) => r.status === 200));

    // All 3 candidates still exist (just none are resolved anymore)
    const remaining = candidates.get('polling_rate');
    assert.equal(remaining.length, 3, 'all candidates preserved');
    assert.equal(remaining.filter((r) => r.status === 'resolved').length, 0, 'no more resolved');

    // Both runs intact
    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 2, 'both runs preserved');
    assert.ok(doc.runs[0].selected.keys.polling_rate, 'run1 primary preserved');
    assert.ok(doc.runs[0].selected.keys.sensor_model, 'run1 passenger preserved');
  });
});

describe('DELETE /key-finder/:cat/:pid/keys/:fk', () => {
  beforeEach(() => {
    keyFinderRegistry._resetForTest();
    cleanupTmp();
    ensureProductDir(PRODUCT_ROW.product_id);
  });

  it('happy path: fresh slate — candidates + selected + primary runs (with discovery_log) all wiped; event includes deleted run numbers', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'polling_rate' });
    seedRun({ pid, runNumber: 2, primary: 'polling_rate' });

    const candidates = new Map([
      ['polling_rate', [
        { value: '1000', status: 'resolved', source_type: 'key_finder' },
        { value: '500', status: 'candidate', source_type: 'key_finder' },
      ]],
    ]);
    const specDb = makeSpecDbStub({ candidates });
    const { ctx, responses, broadcasts } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    // Response
    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok, `expected 200, got ${JSON.stringify(responses)}`);
    assert.equal(ok.body.status, 'deleted');
    assert.equal(ok.body.field_key, 'polling_rate');
    assert.deepEqual([...ok.body.deleted_runs].sort(), [1, 2], 'response lists deleted primary runs');

    // DB side
    assert.equal(specDb._test.demoteCalls.length, 1);
    assert.equal(specDb._test.stripCalls.length, 1);
    assert.equal((candidates.get('polling_rate') || []).length, 0);
    assert.deepEqual([...specDb._test.finderRunDeletes].sort(), [1, 2], 'SQL row deletes cascaded for each primary run');

    // JSON side: fresh slate — no runs left at all since both were primary for this key
    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.selected?.keys?.polling_rate, undefined, 'selected cleared');
    assert.equal(doc.runs.length, 0, 'all primary runs deleted (discovery_log gone with them)');
    assert.equal(doc.run_count, 0, 'run_count reset');

    // Event emitted with deleted_runs meta
    const evt = broadcasts.find((b) => b.data?.event === 'key-finder-field-deleted');
    assert.ok(evt);
    assert.equal(evt.data.meta.field_key, 'polling_rate');
    assert.deepEqual(evt.data.entities.fieldKeys, ['polling_rate']);
    assert.deepEqual([...evt.data.meta.deleted_runs].sort(), [1, 2]);
  });

  it('passenger-only scrub: fk only rode as a passenger (never primary) → runs preserved, only passenger entries scrubbed', async () => {
    const pid = PRODUCT_ROW.product_id;
    // Run 1: polling_rate as primary, sensor_model as passenger
    seedRun({ pid, runNumber: 1, primary: 'polling_rate', passengers: ['sensor_model'], passengerResults: true });
    // Run 2: wireless_technology as primary, sensor_model as passenger
    seedRun({ pid, runNumber: 2, primary: 'wireless_technology', passengers: ['sensor_model'], passengerResults: true });

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'sensor_model'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok);
    assert.deepEqual(ok.body.deleted_runs, [], 'no primary runs deleted when fk was never a primary');

    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    // Both runs still present (neither was a primary run for sensor_model)
    assert.equal(doc.runs.length, 2);
    // sensor_model scrubbed from both
    for (const r of doc.runs) {
      assert.equal(r.selected?.keys?.sensor_model, undefined, `sensor_model scrubbed from run ${r.run_number}`);
      assert.equal(r.response?.results?.sensor_model, undefined, `sensor_model results scrubbed from run ${r.run_number}`);
    }
    // Primary keys survive intact
    assert.ok(doc.runs[0].selected.keys.polling_rate, 'polling_rate (primary of run1) preserved');
    assert.ok(doc.runs[0].response.results.polling_rate, 'polling_rate results preserved');
    assert.ok(doc.runs[1].selected.keys.wireless_technology, 'wireless_technology (primary of run2) preserved');
    assert.ok(doc.runs[1].response.results.wireless_technology, 'wireless_technology results preserved');
  });

  it('mixed: fk primary in one run AND passenger in another → primary run deleted, passenger run scrubbed', async () => {
    const pid = PRODUCT_ROW.product_id;
    // Run 1: sensor_model as primary (its own URL/QU history)
    seedRun({ pid, runNumber: 1, primary: 'sensor_model' });
    // Run 2: polling_rate as primary, sensor_model as passenger (URLs belong to polling_rate)
    seedRun({ pid, runNumber: 2, primary: 'polling_rate', passengers: ['sensor_model'], passengerResults: true });

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'sensor_model'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok);
    assert.deepEqual(ok.body.deleted_runs, [1], 'run 1 (sensor_model primary) deleted; run 2 (passenger) survives');

    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 1, 'only the passenger run remains');
    assert.equal(doc.runs[0].run_number, 2);
    assert.ok(doc.runs[0].selected.keys.polling_rate, 'polling_rate primary preserved in remaining run');
    assert.equal(doc.runs[0].selected?.keys?.sensor_model, undefined, 'sensor_model passenger entry scrubbed');
    assert.equal(doc.runs[0].response?.results?.sensor_model, undefined);
    // polling_rate's run-level discovery_log is preserved (attributed to polling_rate, not sensor_model)
    assert.ok(doc.runs[0].response?.discovery_log, 'run discovery_log survives — belongs to its primary');
  });

  it('empty state: nothing exists for fk → 200 no-op', async () => {
    const pid = PRODUCT_ROW.product_id;
    ensureProductDir(pid);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok, `expected 200 on empty, got ${JSON.stringify(responses)}`);
    assert.equal(ok.body.status, 'deleted');
  });

  it('busy: in-flight op → 409 key_busy (no mutation)', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'polling_rate' });

    keyFinderRegistry.register(pid, 'polling_rate', 'primary');

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    const err = responses.find((r) => r.status === 409);
    assert.ok(err, `expected 409, got ${JSON.stringify(responses)}`);
    assert.equal(err.body.error, 'key_busy');

    // No demote, no strip
    assert.equal(specDb._test.demoteCalls.length, 0);
    assert.equal(specDb._test.stripCalls.length, 0);

    // selected + run untouched
    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(doc.selected?.keys?.polling_rate, 'selected preserved on busy');
    assert.ok(doc.runs[0].selected.keys.polling_rate, 'run selected preserved on busy');
  });

  it('solo primary: a run whose only key is this one → run deleted entirely (fresh slate, no shells)', async () => {
    const pid = PRODUCT_ROW.product_id;
    seedRun({ pid, runNumber: 1, primary: 'polling_rate' }); // solo (no passengers)

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', pid, 'keys', 'polling_rate'],
      null,
      'DELETE',
      { body: {} },
      {},
    );

    const ok = responses.find((r) => r.status === 200);
    assert.ok(ok);
    assert.deepEqual(ok.body.deleted_runs, [1]);

    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 0, 'run deleted — no empty shell');
    assert.equal(doc.run_count, 0);
    assert.deepEqual(doc.selected?.keys || {}, {}, 'selected cleared');
    assert.equal(doc.last_ran_at, '', 'last_ran_at reset with no runs remaining');
  });
});
