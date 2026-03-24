import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enhanceQueryRows } from '../queryPlanner.js';

// --- Factories ---

function makeIdentityLock(overrides = {}) {
  return { brand: 'Logitech', model: 'G Pro X Superlight 2', variant: '', ...overrides };
}

function makeTier1Row(overrides = {}) {
  return {
    query: 'Logitech G Pro X Superlight 2 specifications',
    hint_source: 'tier1_seed',
    tier: 'seed',
    target_fields: [],
    doc_hint: 'spec',
    alias: '',
    domain_hint: '',
    source_host: '',
    group_key: '',
    normalized_key: '',
    ...overrides,
  };
}

function makeTier2Row(overrides = {}) {
  return {
    query: 'Logitech G Pro X Superlight 2 connectivity bluetooth battery life',
    hint_source: 'tier2_group',
    tier: 'group_search',
    target_fields: ['bluetooth', 'battery_hours', 'wireless_charging'],
    doc_hint: '',
    alias: '',
    domain_hint: '',
    source_host: '',
    group_key: 'connectivity',
    normalized_key: '',
    ...overrides,
  };
}

function makeTier3Row(overrides = {}) {
  return {
    query: 'Logitech G Pro X Superlight 2 switch brand',
    hint_source: 'tier3_key',
    tier: 'key_search',
    target_fields: ['switch_brand'],
    doc_hint: '',
    alias: '',
    domain_hint: '',
    source_host: '',
    group_key: 'buttons',
    normalized_key: 'switch_brand',
    ...overrides,
  };
}

function makeConfig() {
  return {};
}

function makeLlmResult(queryRows) {
  return {
    enhanced_queries: queryRows.map((row, i) => ({
      index: i,
      query: `enhanced: ${row.query}`,
    })),
  };
}

// DI helpers
function stubHasApiKey(val) {
  return () => val;
}
function stubResolveModel(val) {
  return () => val;
}
function stubCallLlm(result) {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    return result;
  };
  fn.callCount = () => callCount;
  return fn;
}
function stubCallLlmFailing(errorMsg = 'LLM failed') {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    throw new Error(errorMsg);
  };
  fn.callCount = () => callCount;
  return fn;
}
function stubCallLlmFailThenSucceed(result) {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('transient failure');
    return result;
  };
  fn.callCount = () => callCount;
  return fn;
}

// --- Tests ---

describe('enhanceQueryRows', () => {
  describe('happy path — LLM enhances rows', () => {
    it('returns enhanced rows with LLM-rewritten queries', async () => {
      const rows = [makeTier1Row(), makeTier2Row(), makeTier3Row()];
      const llmResult = makeLlmResult(rows);
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: ['bluetooth', 'battery_hours', 'switch_brand'],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(llmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'llm');
      assert.equal(result.rows.length, 3);
      for (let i = 0; i < 3; i++) {
        assert.ok(result.rows[i].query.includes('enhanced:'));
        assert.equal(result.rows[i].original_query, rows[i].query);
      }
    });
  });

  describe('passthrough — tier metadata never mutated', () => {
    it('preserves tier, group_key, normalized_key, target_fields', async () => {
      const rows = [makeTier2Row(), makeTier3Row()];
      const llmResult = makeLlmResult(rows);
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(llmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.rows[0].tier, 'group_search');
      assert.equal(result.rows[0].group_key, 'connectivity');
      assert.deepEqual(result.rows[0].target_fields, ['bluetooth', 'battery_hours', 'wireless_charging']);
      assert.equal(result.rows[0].normalized_key, '');

      assert.equal(result.rows[1].tier, 'key_search');
      assert.equal(result.rows[1].group_key, 'buttons');
      assert.equal(result.rows[1].normalized_key, 'switch_brand');
      assert.deepEqual(result.rows[1].target_fields, ['switch_brand']);
    });
  });

  describe('row count and order', () => {
    it('output length === input length, same order', async () => {
      const rows = [makeTier1Row(), makeTier2Row(), makeTier3Row()];
      const llmResult = makeLlmResult(rows);
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(llmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.rows.length, 3);
      assert.equal(result.rows[0].tier, 'seed');
      assert.equal(result.rows[1].tier, 'group_search');
      assert.equal(result.rows[2].tier, 'key_search');
    });
  });

  describe('identity lock enforcement', () => {
    it('falls back to original query when LLM drops brand/model', async () => {
      const rows = [makeTier3Row()];
      const badLlmResult = {
        enhanced_queries: [{ index: 0, query: 'switch brand specifications' }],
      };
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(badLlmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'llm');
      assert.equal(result.rows[0].query, rows[0].query);
      assert.equal(result.rows[0].hint_source, 'tier3_key');
    });
  });

  describe('no API key — deterministic fallback', () => {
    it('returns rows unchanged with deterministic_fallback source', async () => {
      const rows = [makeTier1Row(), makeTier3Row()];
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        hasApiKeyFn: stubHasApiKey(false),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].query, rows[0].query);
      assert.equal(result.rows[0].hint_source, 'tier1_seed');
      assert.equal(result.rows[1].query, rows[1].query);
    });
  });

  describe('no resolved model — deterministic fallback', () => {
    it('returns rows unchanged', async () => {
      const rows = [makeTier2Row()];
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel(null),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.equal(result.rows[0].query, rows[0].query);
    });
  });

  describe('LLM retry — fails once then succeeds', () => {
    it('returns llm source after retry', async () => {
      const rows = [makeTier1Row()];
      const llmResult = makeLlmResult(rows);
      const callFn = stubCallLlmFailThenSucceed(llmResult);
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: callFn,
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'llm');
      assert.equal(callFn.callCount(), 2);
    });
  });

  describe('LLM fails twice — deterministic fallback', () => {
    it('returns unchanged rows after 2 failures', async () => {
      const rows = [makeTier1Row(), makeTier3Row()];
      const callFn = stubCallLlmFailing('persistent error');
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: callFn,
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.equal(callFn.callCount(), 2);
      assert.equal(result.rows[0].query, rows[0].query);
      assert.equal(result.rows[1].query, rows[1].query);
    });
  });

  describe('LLM returns empty array', () => {
    it('falls back to deterministic', async () => {
      const rows = [makeTier1Row()];
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm({ enhanced_queries: [] }),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.equal(result.rows[0].query, rows[0].query);
    });
  });

  describe('LLM returns wrong-length array', () => {
    it('falls back to deterministic when too few rows', async () => {
      const rows = [makeTier1Row(), makeTier2Row(), makeTier3Row()];
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm({ enhanced_queries: [{ index: 0, query: 'only one' }] }),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.equal(result.rows.length, 3);
    });
  });

  describe('LLM returns malformed response', () => {
    it('falls back when enhanced_queries is missing', async () => {
      const rows = [makeTier1Row()];
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm({ garbage: true }),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.source, 'deterministic_fallback');
    });
  });

  describe('empty queryRows input', () => {
    it('returns empty rows with deterministic_fallback', async () => {
      const result = await enhanceQueryRows({
        queryRows: [],
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        hasApiKeyFn: stubHasApiKey(true),
      });

      assert.equal(result.source, 'deterministic_fallback');
      assert.deepEqual(result.rows, []);
    });
  });

  describe('hint_source suffix mapping', () => {
    it('appends _llm suffix to each tier hint_source', async () => {
      const rows = [
        makeTier1Row({ hint_source: 'tier1_seed' }),
        makeTier2Row({ hint_source: 'tier2_group' }),
        makeTier3Row({ hint_source: 'tier3_key' }),
      ];
      const llmResult = makeLlmResult(rows);
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(llmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.rows[0].hint_source, 'tier1_seed_llm');
      assert.equal(result.rows[1].hint_source, 'tier2_group_llm');
      assert.equal(result.rows[2].hint_source, 'tier3_key_llm');
    });
  });

  describe('identity lock — partial match still passes', () => {
    it('accepts query that contains brand and model tokens', async () => {
      const rows = [makeTier3Row()];
      const llmResult = {
        enhanced_queries: [{
          index: 0,
          query: 'Logitech G Pro X Superlight 2 switch brand optical teardown',
        }],
      };
      const result = await enhanceQueryRows({
        queryRows: rows,
        queryHistory: [],
        missingFields: [],
        identityLock: makeIdentityLock(),
        config: makeConfig(),
        logger: null,
        callLlmFn: stubCallLlm(llmResult),
        hasApiKeyFn: stubHasApiKey(true),
        resolveModelFn: stubResolveModel('gemini-2.0-flash'),
      });

      assert.equal(result.rows[0].query, 'Logitech G Pro X Superlight 2 switch brand optical teardown');
      assert.equal(result.rows[0].hint_source, 'tier3_key_llm');
    });
  });
});
