import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { handleCandidateDeletionRoute } from '../candidateDeletionRoutes.js';

function withFreshEnv(fn) {
  return async () => {
    const root = path.join('.tmp', `_test_delroute_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

    function ensureProductJson(productId, data = {}) {
      const dir = path.join(root, productId);
      fs.mkdirSync(dir, { recursive: true });
      const base = {
        schema_version: 2, checkpoint_type: 'product',
        product_id: productId, category: 'mouse',
        identity: { brand: 'Test', model: 'Test' },
        sources: [], fields: {}, candidates: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data,
      };
      fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
    }

    let _ctr = 0;
    function seed(productId, fieldKey, value, confidence, sourceType = 'cef') {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const sid = `${sourceType}-${productId}-${++_ctr}`;
      specDb.insertFieldCandidate({
        productId, fieldKey, value: serialized,
        sourceId: sid, sourceType, model: '',
        confidence,
        validationJson: {}, metadataJson: {},
      });
      return sid;
    }

    const responses = [];
    const broadcasts = [];
    const context = {
      jsonRes: (_res, status, body) => { responses.push({ status, body }); },
      getSpecDb: () => specDb,
      broadcastWs: (channel, payload) => { broadcasts.push({ channel, payload }); },
      config: {},
      productRoot: root,
    };

    try {
      await fn({ specDb, root, ensureProductJson, seed, context, responses, broadcasts });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('handleCandidateDeletionRoute', () => {

  it('non-matching route returns false', async () => {
    const result = await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'products'], method: 'GET', req: {}, res: {},
      context: { jsonRes: () => {} },
    });
    assert.equal(result, false);
  });

  it('non-DELETE method returns false', async () => {
    const result = await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'pid', 'weight', 'sid'], method: 'GET', req: {}, res: {},
      context: { jsonRes: () => {} },
    });
    assert.equal(result, false);
  });

  it('single delete: returns ok with deletion result', withFreshEnv(async ({ specDb, root, ensureProductJson, seed, context, responses }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9);
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'cef', value: '58', confidence: 0.9 }] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    const result = await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'mouse-001', 'weight', sid],
      method: 'DELETE', req: {}, res: {},
      context,
    });
    assert.notEqual(result, false);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.ok, true);
    assert.equal(responses[0].body.deleted, true);
  }));

  it('delete-all: returns ok with count', withFreshEnv(async ({ specDb, root, ensureProductJson, seed, context, responses }) => {
    const sid1 = seed('mouse-001', 'weight', '58', 0.9);
    const sid2 = seed('mouse-001', 'weight', '60', 0.8);
    ensureProductJson('mouse-001', {
      candidates: { weight: [
        { source_id: sid1, source_type: 'cef', value: '58', confidence: 0.9 },
        { source_id: sid2, source_type: 'cef', value: '60', confidence: 0.8 },
      ] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    const result = await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'mouse-001', 'weight'],
      method: 'DELETE', req: {}, res: {},
      context,
    });
    assert.notEqual(result, false);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.ok, true);
    assert.equal(responses[0].body.deleted, 2);
  }));

  it('emits data-change broadcast', withFreshEnv(async ({ specDb, root, ensureProductJson, seed, context, broadcasts }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9, 'manual_override');
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'manual_override', value: '58', confidence: 0.9 }] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'mouse-001', 'weight', sid],
      method: 'DELETE', req: {}, res: {},
      context,
    });
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].channel, 'data-change');
  }));

  it('non-variant field delete → response body carries republished=true', withFreshEnv(async ({ specDb, root, ensureProductJson, seed, context, responses }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9);
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'cef', value: '58', confidence: 0.9 }] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'mouse-001', 'weight', sid],
      method: 'DELETE', req: {}, res: {},
      context,
    });
    assert.equal(responses[0].body.ok, true);
    assert.equal(responses[0].body.republished, true);
  }));

  it('variant-backed colors field delete → response body carries republished=false', withFreshEnv(async ({ specDb, root, ensureProductJson, seed, context, responses }) => {
    const sid = seed('mouse-001', 'colors', '["black"]', 0.9, 'cef');
    ensureProductJson('mouse-001', {
      candidates: { colors: [{ source_id: sid, source_type: 'cef', value: '["black"]', confidence: 0.9 }] },
      fields: { colors: { value: ['black'], confidence: 1.0, source: 'variant_registry', sources: [], linked_candidates: [] } },
    });

    await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'mouse-001', 'colors', sid],
      method: 'DELETE', req: {}, res: {},
      context,
    });
    assert.equal(responses[0].body.ok, true);
    assert.equal(responses[0].body.republished, false);
  }));

  it('specDb not found → 404', async () => {
    const responses = [];
    const result = await handleCandidateDeletionRoute({
      parts: ['review', 'mouse', 'candidates', 'pid', 'weight', 'sid'],
      method: 'DELETE', req: {}, res: {},
      context: {
        jsonRes: (_res, status, body) => { responses.push({ status, body }); },
        getSpecDb: () => null,
        broadcastWs: () => {},
        config: {},
        productRoot: '/tmp',
      },
    });
    assert.notEqual(result, false);
    assert.equal(responses[0].status, 404);
  });
});
