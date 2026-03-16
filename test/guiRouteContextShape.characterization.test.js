import test from 'node:test';
import assert from 'node:assert/strict';

import { createInfraRouteContext } from '../src/app/api/infraRouteContext.js';

test('characterization: createInfraRouteContext returns exactly 21 keys', () => {
  const infraPropNames = [
    'jsonRes', 'readJsonBody', 'listDirs', 'canonicalSlugify', 'HELPER_ROOT',
    'DIST_ROOT', 'OUTPUT_ROOT', 'INDEXLAB_ROOT', 'fs', 'path',
    'runDataStorageState', 'getSearxngStatus', 'startSearxngStack', 'startProcess',
    'stopProcess', 'processStatus', 'isProcessRunning', 'waitForProcessExit',
    'broadcastWs',
  ];

  const options = {};
  for (const name of infraPropNames) {
    options[name] = { _sentinel: name };
  }

  const ctx = createInfraRouteContext(options);
  const keys = Object.keys(ctx);

  // 19 from options + fetchApi + processRef defaults = 21
  assert.equal(keys.length, 21, `expected 21 keys, got ${keys.length}`);

  for (const name of infraPropNames) {
    assert.equal(ctx[name], options[name], `${name} should be same reference`);
  }
});

test('characterization: createInfraRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createInfraRouteContext(null), TypeError);
  assert.throws(() => createInfraRouteContext('string'), TypeError);
  assert.throws(() => createInfraRouteContext([1, 2]), TypeError);
});
