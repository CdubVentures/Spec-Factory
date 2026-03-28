import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInfraSerperRoutes } from '../infra/serperRoutes.js';

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    getSerperApiKey: () => 'sk-test-key',
    getSerperEnabled: () => true,
    fetchApi: async () => new Response(JSON.stringify({ balance: 2500, rateLimit: 50 }), { status: 200 }),
    ...overrides,
  };
}

async function invoke(handler, parts, method = 'GET') {
  return handler(parts, new URLSearchParams(), method, {}, {});
}

describe('serper/credit route contract', () => {
  it('returns credit when key is configured and Serper responds', async () => {
    const handler = createInfraSerperRoutes(makeCtx());
    const result = await invoke(handler, ['serper', 'credit']);
    assert.equal(result.status, 200);
    assert.equal(result.body.credit, 2500);
    assert.equal(result.body.configured, true);
    assert.equal(result.body.enabled, true);
  });

  it('returns configured:false when no API key is set', async () => {
    const handler = createInfraSerperRoutes(makeCtx({
      getSerperApiKey: () => '',
    }));
    const result = await invoke(handler, ['serper', 'credit']);
    assert.equal(result.status, 200);
    assert.equal(result.body.credit, null);
    assert.equal(result.body.configured, false);
    assert.equal(result.body.enabled, true);
  });

  it('returns enabled:false when Serper is disabled', async () => {
    const handler = createInfraSerperRoutes(makeCtx({
      getSerperEnabled: () => false,
    }));
    const result = await invoke(handler, ['serper', 'credit']);
    assert.equal(result.status, 200);
    assert.equal(result.body.enabled, false);
  });

  it('returns error auth_failed on 401', async () => {
    const handler = createInfraSerperRoutes(makeCtx({
      fetchApi: async () => new Response('', { status: 401 }),
    }));
    const result = await invoke(handler, ['serper', 'credit']);
    assert.equal(result.status, 200);
    assert.equal(result.body.credit, null);
    assert.equal(result.body.configured, true);
    assert.equal(result.body.error, 'auth_failed');
  });

  it('returns 500 when fetch throws', async () => {
    const handler = createInfraSerperRoutes(makeCtx({
      fetchApi: async () => { throw new Error('network down'); },
    }));
    const result = await invoke(handler, ['serper', 'credit']);
    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'serper_account_check_failed');
  });

  it('returns false for non-serper paths', async () => {
    const handler = createInfraSerperRoutes(makeCtx());
    const result = await invoke(handler, ['other', 'thing']);
    assert.equal(result, false);
  });
});
