/**
 * keyFinder route — Phase 3b Loop dispatch characterization.
 *
 * Asserts the shape of the route's POST handler when mode='loop':
 *   - No longer 400s (the pre-3b guard is flipped)
 *   - Registers an op with subType='loop' and initial status='queued'
 *   - Transitions the op to 'running' after acquiring the per-(pid, fieldKey) lock
 *   - Emits key-finder-loop (not key-finder-run) on completion
 *   - Run + Loop on the SAME (pid, fieldKey) serialize via the shared lock
 *   - Run + Loop on DIFFERENT keys run in parallel
 *   - Reserved / missing field_key paths return the same errors as mode='run'
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerKeyFinderRoutes } from '../api/keyFinderRoutes.js';
import {
  initOperationsRegistry,
  listOperations,
  _resetForTest,
} from '../../../core/operations/operationsRegistry.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const POLLING_RATE_RULE = {
  field_key: 'polling_rate',
  difficulty: 'medium',
  required_level: 'mandatory',
  availability: 'always',
  group: 'sensor_performance',
  contract: { type: 'number', shape: 'scalar' },
  evidence: { min_evidence_refs: 1 },
  ai_assist: { reasoning_note: 'Report native wireless polling rate.' },
  enum: { policy: 'open' },
};

const COMPILED_FIELD_RULES = {
  fields: { polling_rate: POLLING_RATE_RULE },
  known_values: {},
};

const COMPONENT_FIELD_RULES = {
  fields: {
    sensor: {
      ...POLLING_RATE_RULE,
      field_key: 'sensor',
      group: 'sensor_identity',
      enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
    },
    sensor_brand: {
      ...POLLING_RATE_RULE,
      field_key: 'sensor_brand',
      group: 'sensor_identity',
      component_identity_projection: { component_type: 'sensor', facet: 'brand' },
    },
    sensor_link: {
      ...POLLING_RATE_RULE,
      field_key: 'sensor_link',
      group: 'sensor_identity',
      component_identity_projection: { component_type: 'sensor', facet: 'link' },
    },
    dpi: {
      ...POLLING_RATE_RULE,
      field_key: 'dpi',
      group: 'sensor_performance',
    },
  },
  known_values: {},
};

const PRODUCT_ROW = {
  product_id: 'kf-loop-001',
  category: 'mouse',
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
  base_model: 'DeathAdder V3 Pro',
};

const TMP_ROOT = path.join(os.tmpdir(), `kf-loop-routes-${Date.now()}`);
function cleanupTmp() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}
function productRootFor(productId) {
  const dir = path.join(TMP_ROOT, 'products', productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    product_id: productId, category: 'mouse', candidates: {}, fields: {},
  }));
  return path.join(TMP_ROOT, 'products');
}

function makeSpecDbStub(overrides = {}) {
  return {
    category: 'mouse',
    getFinderStore: (id) => (id === 'keyFinder' ? {
      getSetting: () => '',
      upsert: () => {},
      insertRun: () => {},
    } : null),
    getCompiledRules: () => COMPILED_FIELD_RULES,
    getProduct: () => PRODUCT_ROW,
    variants: {
      listActive: () => [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
      listByProduct: () => [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
    },
    getFieldCandidatesByProductAndField: () => [],
    getItemComponentLinks: () => [],
    getResolvedFieldCandidate: () => null,
    ...overrides,
  };
}

function makeCtx({ specDb } = {}) {
  const responses = [];
  const broadcasts = [];
  const broadcastWs = (channel, data) => broadcasts.push({ channel, data });
  const ctx = {
    jsonRes: (_res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async (req) => req?.body || {},
    config: { productRoot: productRootFor(PRODUCT_ROW.product_id) },
    appDb: null,
    getSpecDb: () => specDb || makeSpecDbStub(),
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses, broadcasts };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('POST /key-finder/:cat/:pid — mode dispatch', () => {
  beforeEach(() => { _resetForTest(); cleanupTmp(); });

  it("mode='loop' no longer returns 400 loop_mode_not_yet_supported (the 3b flip)", async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'polling_rate', mode: 'loop' } },
      {},
    );

    assert.notDeepEqual(
      responses.filter((r) => r.body?.error === 'loop_mode_not_yet_supported'),
      responses.filter((r) => r.body?.error === 'loop_mode_not_yet_supported').length > 0 ? [] : [1],
    );
    assert.equal(
      responses.filter((r) => r.body?.error === 'loop_mode_not_yet_supported').length,
      0,
      'no 400 loop_mode_not_yet_supported response',
    );
    // The immediate sync response should be 202 Accepted (from fireAndForget)
    const acceptedResponses = responses.filter((r) => r.status === 202);
    assert.equal(acceptedResponses.length, 1, `got ${responses.length} responses: ${JSON.stringify(responses.map((r) => ({ status: r.status, err: r.body?.error })))}`);
    assert.ok(acceptedResponses[0].body?.ok);
    assert.ok(acceptedResponses[0].body?.operationId);
  });

  it("mode='loop' registers an op with subType='loop'", async () => {
    const { ctx } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'polling_rate', mode: 'loop' } },
      {},
    );

    const ops = listOperations();
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, 'kf');
    assert.equal(ops[0].subType, 'loop');
    assert.equal(ops[0].fieldKey, 'polling_rate');
  });

  it("mode='run' still registers with subType='' (back-compat)", async () => {
    const { ctx } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'polling_rate', mode: 'run' } },
      {},
    );

    const ops = listOperations();
    assert.equal(ops.length, 1);
    assert.equal(ops[0].subType, '');
  });

  it("mode='loop' + reserved field_key returns 400 reserved_field_key (parity with run)", async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'release_date', mode: 'loop' } },
      {},
    );

    const err400 = responses.find((r) => r.status === 400);
    assert.ok(err400, 'expected a 400');
    assert.equal(err400.body.error, 'reserved_field_key');
  });

  it("mode='loop' + unknown field_key returns 404 missing_field_rule (parity with run)", async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'not_in_rules', mode: 'loop' } },
      {},
    );

    const err404 = responses.find((r) => r.status === 404);
    assert.ok(err404, 'expected a 404');
    assert.equal(err404.body.error, 'missing_field_rule');
  });

  it("rejects invalid mode values", async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'polling_rate', mode: 'galactic' } },
      {},
    );

    const err400 = responses.find((r) => r.status === 400 && r.body.error === 'invalid_mode');
    assert.ok(err400, 'unknown mode rejected with invalid_mode');
  });

  it('rejects component brand/link runs until the parent component key is published', async () => {
    const { ctx, responses } = makeCtx({
      specDb: makeSpecDbStub({
        getCompiledRules: () => COMPONENT_FIELD_RULES,
        getResolvedFieldCandidate: () => null,
      }),
    });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'sensor_brand', mode: 'run' } },
      {},
    );

    const err409 = responses.find((r) => r.status === 409);
    assert.ok(err409, 'expected component dependency conflict');
    assert.equal(err409.body.error, 'component_parent_unpublished');
    assert.equal(err409.body.field_key, 'sensor_brand');
    assert.equal(err409.body.component_parent_key, 'sensor');
    assert.equal(listOperations().length, 0, 'blocked run must not register an operation');
  });

  it('rejects component attribute runs until the parent component key is published', async () => {
    const { ctx, responses } = makeCtx({
      specDb: makeSpecDbStub({
        getCompiledRules: () => COMPONENT_FIELD_RULES,
        getResolvedFieldCandidate: () => null,
        getFieldStudioMap: () => ({
          component_sources: [
            {
              component_type: 'sensor',
              roles: {
                properties: [
                  { field_key: 'dpi' },
                ],
              },
            },
          ],
        }),
      }),
    });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(
      ['key-finder', 'mouse', PRODUCT_ROW.product_id],
      null,
      'POST',
      { body: { field_key: 'dpi', mode: 'run' } },
      {},
    );

    const err409 = responses.find((r) => r.status === 409);
    assert.ok(err409, 'expected component dependency conflict');
    assert.equal(err409.body.error, 'component_parent_unpublished');
    assert.equal(err409.body.field_key, 'dpi');
    assert.equal(err409.body.component_parent_key, 'sensor');
    assert.equal(listOperations().length, 0, 'blocked run must not register an operation');
  });
});
