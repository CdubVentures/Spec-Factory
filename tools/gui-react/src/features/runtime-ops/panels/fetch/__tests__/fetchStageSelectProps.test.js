import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const EXPECTED_KEYS = ['stealth', 'auto_scroll', 'dom_expansion', 'css_override'];

function buildPanelStub(exportName) {
  return `export function ${exportName}() { return null; }`;
}

function createFetchData(overrides = {}) {
  return {
    run_id: 'run-001',
    stealth: {
      patches: ['webdriver', 'plugins', 'languages'],
      injections: [{ worker_id: 'fetch-a1', injected: true, ts: '2026-02-20T00:01:00.000Z' }],
      total_injected: 1,
      total_failed: 0,
    },
    ...overrides,
  };
}

async function createFetchHarness() {
  if (!createFetchHarness.promise) {
    createFetchHarness.promise = loadBundledModule(
      'tools/gui-react/src/features/runtime-ops/panels/fetch/fetchStageRegistry.ts',
      {
        prefix: 'fetch-registry-',
        stubs: {
          '../shared/stageGroupContracts.ts': `
            export function buildStageEntry(
              key, label, tip, markerClass, idleClass, outlineClass, Component, selectProps,
            ) {
              return {
                key, label, tip, markerClass, idleClass, outlineClass,
                render: (ctx) => ({ type: Component, props: selectProps(ctx) }),
                selectProps,
              };
            }
          `,
          './FetchStealthPanel.tsx': buildPanelStub('FetchStealthPanel'),
          './FetchPlaceholderPanel.tsx': buildPanelStub('FetchPlaceholderPanel'),
        },
      },
    ).then((registryModule) => ({
      keys: registryModule.FETCH_STAGE_KEYS,
      selectProps: registryModule.FETCH_SELECT_PROPS,
      persistScope: 'test-category',
    }));
  }

  return createFetchHarness.promise;
}

createFetchHarness.promise = null;

test('fetch stage registry exports the published key order', async () => {
  const harness = await createFetchHarness();
  assert.deepStrictEqual([...harness.keys], EXPECTED_KEYS);
  assert.strictEqual(Object.keys(harness.selectProps).length, EXPECTED_KEYS.length);
  assert.deepStrictEqual(Object.keys(harness.selectProps).sort(), [...EXPECTED_KEYS].sort());
});

test('stealth selector extracts stealth data from context', async () => {
  const harness = await createFetchHarness();
  const data = createFetchData();
  const props = harness.selectProps.stealth({
    data,
    persistScope: harness.persistScope,
  });
  assert.deepStrictEqual(props.data, data.stealth);
  assert.strictEqual(props.persistScope, harness.persistScope);
});

test('stealth selector returns empty fallback when data is undefined', async () => {
  const harness = await createFetchHarness();
  const props = harness.selectProps.stealth({
    data: undefined,
    persistScope: harness.persistScope,
  });
  assert.ok(props.data && typeof props.data === 'object');
  assert.deepStrictEqual(props.data.patches, []);
  assert.deepStrictEqual(props.data.injections, []);
  assert.strictEqual(props.data.total_injected, 0);
  assert.strictEqual(props.data.total_failed, 0);
});

test('placeholder selectors return persistScope and tool branding', async () => {
  const harness = await createFetchHarness();
  for (const key of ['auto_scroll', 'dom_expansion', 'css_override']) {
    const props = harness.selectProps[key]({
      data: undefined,
      persistScope: harness.persistScope,
    });
    assert.strictEqual(props.persistScope, harness.persistScope);
    assert.strictEqual(props.toolKey, 'playwright');
    assert.strictEqual(props.toolCategory, 'script');
  }
});
