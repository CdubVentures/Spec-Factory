import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFinderRouteContext } from '../finderRouteContext.js';

function makeValidOptions(overrides = {}) {
  return {
    jsonRes: () => {},
    readJsonBody: async () => ({}),
    config: { runtime: {} },
    appDb: { pragma: () => {} },
    getSpecDb: () => ({}),
    broadcastWs: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  };
}

describe('createFinderRouteContext', () => {
  it('returns exactly the shared-infra fields (no per-finder functions)', () => {
    const opts = makeValidOptions();
    const ctx = createFinderRouteContext(opts);
    assert.deepEqual(
      Object.keys(ctx).sort(),
      ['appDb', 'broadcastWs', 'config', 'getSpecDb', 'jsonRes', 'logger', 'readJsonBody'].sort(),
    );
  });

  it('passes through the exact shared-infra values', () => {
    const opts = makeValidOptions();
    const ctx = createFinderRouteContext(opts);
    assert.equal(ctx.jsonRes, opts.jsonRes);
    assert.equal(ctx.readJsonBody, opts.readJsonBody);
    assert.equal(ctx.config, opts.config);
    assert.equal(ctx.appDb, opts.appDb);
    assert.equal(ctx.getSpecDb, opts.getSpecDb);
    assert.equal(ctx.broadcastWs, opts.broadcastWs);
    assert.equal(ctx.logger, opts.logger);
  });

  it('defaults logger to null when omitted', () => {
    const opts = makeValidOptions();
    delete opts.logger;
    const ctx = createFinderRouteContext(opts);
    assert.equal(ctx.logger, null);
  });

  it('throws when options is missing entirely', () => {
    assert.throws(() => createFinderRouteContext(), TypeError);
  });

  it('throws when options is null', () => {
    assert.throws(() => createFinderRouteContext(null), TypeError);
  });

  it('throws when options is an array', () => {
    assert.throws(() => createFinderRouteContext([]), TypeError);
  });

  it('throws when options is a primitive', () => {
    assert.throws(() => createFinderRouteContext('nope'), TypeError);
  });

  for (const key of ['jsonRes', 'readJsonBody', 'config', 'appDb', 'getSpecDb', 'broadcastWs']) {
    it(`throws when required option "${key}" is missing`, () => {
      const opts = makeValidOptions();
      delete opts[key];
      assert.throws(
        () => createFinderRouteContext(opts),
        (err) => err instanceof TypeError && err.message.includes(key),
      );
    });
  }

  it('does not include per-finder orchestrator fields on the returned context', () => {
    const opts = makeValidOptions();
    const ctx = createFinderRouteContext(opts);
    assert.equal('runColorEditionFinder' in ctx, false);
    assert.equal('runProductImageFinder' in ctx, false);
    assert.equal('deleteVariant' in ctx, false);
  });
});
