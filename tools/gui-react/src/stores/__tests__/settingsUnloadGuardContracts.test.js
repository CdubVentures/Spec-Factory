import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../test/helpers/loadBundledModule.js';

/**
 * settingsUnloadGuard contract tests.
 *
 * The guard is a module-level singleton (NOT a React hook). It attaches
 * beforeunload / pagehide listeners and fires fetch({ keepalive: true })
 * for dirty settings domains when the page unloads.
 *
 * We test the guard by stubbing window + fetch, then importing the module
 * via esbuild bundling (same harness pattern as settingsAutosaveFlushOnUnmountContracts).
 */

function loadGuardModule() {
  return loadBundledModule('tools/gui-react/src/stores/settingsUnloadGuard.ts', {
    prefix: 'unload-guard-',
  });
}

function createWindowStub() {
  const listeners = {};
  const fetchCalls = [];
  let fetchShouldThrow = false;

  const windowStub = {
    addEventListener(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter((h) => h !== handler);
    },
  };

  const fetchStub = (url, init) => {
    if (fetchShouldThrow) throw new Error('network failure');
    fetchCalls.push({ url, init });
    return Promise.resolve({ ok: true });
  };

  return {
    windowStub,
    fetchStub,
    fetchCalls,
    listeners,
    setFetchThrows(v) { fetchShouldThrow = v; },
    fireEvent(event) {
      for (const handler of (listeners[event] || [])) {
        handler();
      }
    },
    install() {
      globalThis.window = windowStub;
      globalThis.fetch = fetchStub;
    },
    cleanup() {
      delete globalThis.window;
      delete globalThis.fetch;
    },
  };
}

test('register + unload with dirty state fires fetch keepalive', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: { fetchConcurrency: 6 },
      }),
      markFlushed: () => {},
    });

    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 1);
    assert.equal(env.fetchCalls[0].url, '/api/v1/runtime-settings');
    assert.equal(env.fetchCalls[0].init.method, 'PUT');
    assert.equal(env.fetchCalls[0].init.keepalive, true);
    assert.deepEqual(
      JSON.parse(env.fetchCalls[0].init.body),
      { fetchConcurrency: 6 },
    );
    assert.equal(env.fetchCalls[0].init.headers['Content-Type'], 'application/json');

    unregister();
  } finally {
    env.cleanup();
  }
});

test('register + unload with clean state does not fire fetch', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'storage',
      isDirty: () => false,
      getPayload: () => ({
        url: '/api/v1/storage-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => {},
    });

    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 0);
    unregister();
  } finally {
    env.cleanup();
  }
});

test('register + unregister + unload does not fire fetch', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: { fetchConcurrency: 6 },
      }),
      markFlushed: () => {},
    });

    unregister();
    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 0);
  } finally {
    env.cleanup();
  }
});

test('multiple domains, only dirty ones are flushed', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unreg1 = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: { a: 1 },
      }),
      markFlushed: () => {},
    });
    const unreg2 = mod.registerUnloadGuard({
      domain: 'storage',
      isDirty: () => false,
      getPayload: () => ({
        url: '/api/v1/storage-settings',
        method: 'PUT',
        body: { b: 2 },
      }),
      markFlushed: () => {},
    });
    const unreg3 = mod.registerUnloadGuard({
      domain: 'llm',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/llm-settings/mouse/routes',
        method: 'PUT',
        body: { c: 3 },
      }),
      markFlushed: () => {},
    });

    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 2);
    const urls = env.fetchCalls.map((c) => c.url);
    assert.ok(urls.includes('/api/v1/runtime-settings'));
    assert.ok(urls.includes('/api/v1/llm-settings/mouse/routes'));

    unreg1();
    unreg2();
    unreg3();
  } finally {
    env.cleanup();
  }
});

test('unload sets isDomainFlushedByUnload flag', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => {},
    });

    assert.equal(mod.isDomainFlushedByUnload('runtime'), false);
    env.fireEvent('beforeunload');
    assert.equal(mod.isDomainFlushedByUnload('runtime'), true);
    assert.equal(mod.isDomainFlushedByUnload('storage'), false);

    unregister();
  } finally {
    env.cleanup();
  }
});

test('markDomainFlushedByUnmount prevents guard from flushing that domain', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => {},
    });

    mod.markDomainFlushedByUnmount('runtime');
    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 0);
    unregister();
  } finally {
    env.cleanup();
  }
});

test('getPayload returning null skips domain', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => null,
      markFlushed: () => {},
    });

    env.fireEvent('beforeunload');

    assert.equal(env.fetchCalls.length, 0);
    unregister();
  } finally {
    env.cleanup();
  }
});

test('fetch throwing is silently caught, continues to next domain', async () => {
  const env = createWindowStub();
  env.install();
  env.setFetchThrows(true);
  try {
    const mod = await loadGuardModule();
    let flushedDomains = [];
    const unreg1 = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => { flushedDomains.push('runtime'); },
    });
    // Second domain — fetch still throws but guard should attempt it
    env.setFetchThrows(false);
    const unreg2 = mod.registerUnloadGuard({
      domain: 'storage',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/storage-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => { flushedDomains.push('storage'); },
    });

    // The first fetch will throw (set above), but it should catch and continue
    // We need fetch to throw only for the first call
    let callCount = 0;
    globalThis.fetch = (url, init) => {
      callCount++;
      if (callCount === 1) throw new Error('network failure');
      env.fetchCalls.push({ url, init });
      return Promise.resolve({ ok: true });
    };

    env.fireEvent('beforeunload');

    // markFlushed should still be called for both (best-effort)
    assert.ok(flushedDomains.includes('runtime'));
    assert.ok(flushedDomains.includes('storage'));

    unreg1();
    unreg2();
  } finally {
    env.cleanup();
  }
});

test('markFlushed callback is called on successful unload flush', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    let flushed = false;
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => { flushed = true; },
    });

    env.fireEvent('beforeunload');
    assert.equal(flushed, true);

    unregister();
  } finally {
    env.cleanup();
  }
});

test('pagehide event also triggers flush', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unregister = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: { x: 1 },
      }),
      markFlushed: () => {},
    });

    env.fireEvent('pagehide');

    assert.equal(env.fetchCalls.length, 1);
    assert.equal(env.fetchCalls[0].init.keepalive, true);

    unregister();
  } finally {
    env.cleanup();
  }
});

test('last unregister removes window listeners', async () => {
  const env = createWindowStub();
  env.install();
  try {
    const mod = await loadGuardModule();
    const unreg1 = mod.registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => {},
    });
    const unreg2 = mod.registerUnloadGuard({
      domain: 'storage',
      isDirty: () => true,
      getPayload: () => ({
        url: '/api/v1/storage-settings',
        method: 'PUT',
        body: {},
      }),
      markFlushed: () => {},
    });

    unreg1();
    // Still one registration — listeners should remain
    assert.ok((env.listeners.beforeunload || []).length > 0);

    unreg2();
    // All unregistered — listeners should be removed
    assert.equal((env.listeners.beforeunload || []).length, 0);
    assert.equal((env.listeners.pagehide || []).length, 0);
  } finally {
    env.cleanup();
  }
});
