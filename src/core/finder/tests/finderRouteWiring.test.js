import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wireFinderRoutes } from '../finderRouteWiring.js';
import { FINDER_MODULES } from '../finderModuleRegistry.js';

function stubDeps() {
  return {
    jsonRes: () => {},
    readJsonBody: async () => ({}),
    config: {},
    appDb: {},
    getSpecDb: () => ({}),
    broadcastWs: () => {},
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  };
}

describe('wireFinderRoutes', () => {
  it('returns routeCtx + routeDefinitions for every registered finder module', async () => {
    const { routeCtx, routeDefinitions } = await wireFinderRoutes(stubDeps());

    for (const mod of FINDER_MODULES) {
      const ctxKey = `${mod.id}RouteContext`;
      assert.ok(routeCtx[ctxKey], `routeCtx must include ${ctxKey}`);
      assert.equal(typeof routeCtx[ctxKey], 'object');

      const def = routeDefinitions.find(d => d.key === mod.id);
      assert.ok(def, `routeDefinitions must include entry for ${mod.id}`);
      assert.equal(typeof def.registrar, 'function', `registrar for ${mod.id} must be a function`);
    }
  });

  it('routeDefinitions length equals FINDER_MODULES length (no extras, no omissions)', async () => {
    const { routeDefinitions } = await wireFinderRoutes(stubDeps());
    assert.equal(routeDefinitions.length, FINDER_MODULES.length);
  });

  it('passes createLogger output as logger to each context factory (smoke)', async () => {
    let loggerCalls = [];
    const deps = {
      ...stubDeps(),
      createLogger: (prefix) => {
        loggerCalls.push(prefix);
        return { info: () => {}, warn: () => {}, error: () => {} };
      },
    };
    await wireFinderRoutes(deps);

    // Every module's routePrefix should have produced a logger
    for (const mod of FINDER_MODULES) {
      assert.ok(loggerCalls.includes(mod.routePrefix), `createLogger called for ${mod.routePrefix}`);
    }
  });
});
