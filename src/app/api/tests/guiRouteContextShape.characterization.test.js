import test from 'node:test';
import assert from 'node:assert/strict';

import { createInfraRouteContext } from '../infraRouteContext.js';

const INJECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'listDirs', 'canonicalSlugify', 'HELPER_ROOT',
  'DIST_ROOT', 'OUTPUT_ROOT', 'INDEXLAB_ROOT', 'fs', 'path',
  'runDataStorageState', 'getSearxngStatus', 'startSearxngStack', 'startProcess',
  'stopProcess', 'processStatus', 'isProcessRunning', 'waitForProcessExit',
  'broadcastWs',
];

function createOptions(keys) {
  return Object.fromEntries(keys.map((key) => [key, { key }]));
}

test('createInfraRouteContext returns the required injected surface and defaults', () => {
  const options = createOptions(INJECTED_KEYS);

  const ctx = createInfraRouteContext(options);

  for (const key of INJECTED_KEYS) {
    assert.equal(ctx[key], options[key], `${key} should preserve the injected reference`);
  }
  assert.equal(ctx.fetchApi, globalThis.fetch);
  assert.equal(ctx.processRef, process);
});

test('createInfraRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createInfraRouteContext(null), TypeError);
  assert.throws(() => createInfraRouteContext('string'), TypeError);
  assert.throws(() => createInfraRouteContext([1, 2]), TypeError);
});
