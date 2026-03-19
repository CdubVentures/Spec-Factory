import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enqueueAdapterSeedUrls,
  resolveScreencastCallback,
  createRunProductFetcherFactory,
} from '../src/features/indexing/orchestration/shared/runProductContracts.js';

test('runProduct contract helpers enqueue adapter seeds with adapter_seed priority', () => {
  const calls = [];
  const planner = {
    enqueue(url, kind, options) {
      calls.push({ url, kind, options });
    },
  };

  enqueueAdapterSeedUrls(planner, ['https://seed.one', 'https://seed.two']);

  assert.deepEqual(calls, [
    {
      url: 'https://seed.one',
      kind: 'adapter_seed',
      options: { forceApproved: true, forceBrandBypass: false },
    },
    {
      url: 'https://seed.two',
      kind: 'adapter_seed',
      options: { forceApproved: true, forceBrandBypass: false },
    },
  ]);
});

test('runProduct fetcher factory wires screencast only into browser-backed fetchers', () => {
  const constructorCalls = [];
  class DryRunFetcherClass {
    constructor(...args) {
      constructorCalls.push({ kind: 'dryrun', args });
    }
  }
  class HttpFetcherClass {
    constructor(...args) {
      constructorCalls.push({ kind: 'http', args });
    }
  }
  class CrawleeFetcherClass {
    constructor(...args) {
      constructorCalls.push({ kind: 'crawlee', args });
    }
  }
  class PlaywrightFetcherClass {
    constructor(...args) {
      constructorCalls.push({ kind: 'playwright', args });
    }
  }

  const screencastCallback = () => {};
  const createFetcherForMode = createRunProductFetcherFactory({
    fetcherConfig: { mode: 'test' },
    logger: { info() {} },
    screencastCallback,
    DryRunFetcherClass,
    HttpFetcherClass,
    CrawleeFetcherClass,
    PlaywrightFetcherClass,
  });

  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: false, onScreencastFrame: screencastCallback }), undefined);
  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: true, onScreencastFrame: 'not-a-function' }), undefined);
  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: true, onScreencastFrame: screencastCallback }), screencastCallback);

  createFetcherForMode('dryrun');
  createFetcherForMode('http');
  createFetcherForMode('crawlee');
  createFetcherForMode('playwright');

  assert.deepEqual(
    constructorCalls.map(({ kind, args }) => ({
      kind,
      hasScreencast: Boolean(args[2]?.onScreencastFrame),
      argCount: args.length,
    })),
    [
      { kind: 'dryrun', hasScreencast: false, argCount: 2 },
      { kind: 'http', hasScreencast: false, argCount: 2 },
      { kind: 'crawlee', hasScreencast: true, argCount: 3 },
      { kind: 'playwright', hasScreencast: true, argCount: 3 },
    ],
  );

  assert.equal(createFetcherForMode('unsupported'), null);
});
