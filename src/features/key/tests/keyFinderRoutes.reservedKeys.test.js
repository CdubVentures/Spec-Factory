/**
 * keyFinder route — GET /key-finder/:category/reserved-keys characterization.
 *
 * Exposes the reserved-keys denylist (variant finders + EG-locked) so the
 * dashboard panel can filter them out of the per-key list. Derived from
 * FINDER_MODULES ∪ EG_LOCKED_KEYS — not hand-maintained.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerKeyFinderRoutes } from '../api/keyFinderRoutes.js';
import { EG_LOCKED_KEYS } from '../../../core/finder/finderExclusions.js';
import { initOperationsRegistry } from '../../../core/operations/index.js';

function makeCtx() {
  const responses = [];
  const broadcastWs = () => {};
  const ctx = {
    jsonRes: (res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async () => ({}),
    config: {},
    appDb: null,
    getSpecDb: () => ({}),
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses };
}

describe('GET /key-finder/:category/reserved-keys', () => {
  it('returns { reserved: string[] } sorted alphabetically', async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    const handled = await handler(['key-finder', 'mouse', 'reserved-keys'], null, 'GET', {}, {});

    assert.notEqual(handled, false, 'handler must claim the reserved-keys route');
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 200);
    const body = responses[0].body;
    assert.ok(body && Array.isArray(body.reserved), 'response has reserved: string[]');
    const sorted = [...body.reserved].sort();
    assert.deepEqual(body.reserved, sorted, 'reserved array is sorted');
  });

  it('includes every EG-locked key', async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'reserved-keys'], null, 'GET', {}, {});

    const reserved = new Set(responses[0].body.reserved);
    for (const key of EG_LOCKED_KEYS) {
      assert.ok(reserved.has(key), `EG-locked key "${key}" must be in reserved list`);
    }
  });

  it('includes CEF / RDF / SKF owned field keys derived from FINDER_MODULES', async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'reserved-keys'], null, 'GET', {}, {});

    const reserved = new Set(responses[0].body.reserved);
    assert.ok(reserved.has('release_date'), 'RDF-owned release_date is reserved');
    assert.ok(reserved.has('sku'), 'SKF-owned sku is reserved');
    assert.ok(reserved.has('colors'), 'EG-locked colors is reserved');
    assert.ok(reserved.has('editions'), 'EG-locked editions is reserved');
  });

  it('does not include keyFinder-owned keys (empty by design)', async () => {
    const { ctx, responses } = makeCtx();
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'reserved-keys'], null, 'GET', {}, {});

    const reserved = new Set(responses[0].body.reserved);
    assert.ok(!reserved.has('polling_rate'), 'polling_rate is a keyFinder target, not reserved');
    assert.ok(!reserved.has('sensor_model'), 'sensor_model is a keyFinder target, not reserved');
  });
});
