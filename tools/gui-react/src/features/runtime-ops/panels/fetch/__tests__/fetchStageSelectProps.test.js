import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const EXPECTED_KEYS = ['stealth', 'cookie_consent', 'auto_scroll', 'dom_expansion', 'css_override'];

function buildPanelStub(exportName) {
  return `export function ${exportName}() { return null; }`;
}

function buildToolBrandStub() {
  return `export function ToolBrandHeader() { return null; }`;
}

function buildToolRegistryStub() {
  return `export function resolveToolBrand() { return undefined; }\nexport const TOOL_BRAND_REGISTRY = {};`;
}

function buildToolLogosStub() {
  return [
    'export function ScriptIcon() { return null; }',
    'export function PlaywrightLogo() { return null; }',
    'export function CrawleeLogo() { return null; }',
    'export function SpecFactoryLogo() { return null; }',
  ].join('\n');
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
          './FetchCookieConsentPanel.tsx': buildPanelStub('FetchCookieConsentPanel'),
          './FetchAutoScrollPanel.tsx': buildPanelStub('FetchAutoScrollPanel'),
          './FetchDomExpansionPanel.tsx': buildPanelStub('FetchDomExpansionPanel'),
          './FetchCssOverridePanel.tsx': buildPanelStub('FetchCssOverridePanel'),
          '../shared/ToolBrandHeader.tsx': buildToolBrandStub(),
          '../shared/toolBrandRegistry.ts': buildToolRegistryStub(),
          '../shared/toolLogos.tsx': buildToolLogosStub(),
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
  assert.deepStrictEqual(props.data.records, []);
  assert.strictEqual(props.data.total, 0);
});

test('auto_scroll selector extracts auto_scroll data from context', async () => {
  const harness = await createFetchHarness();
  const data = createFetchData();
  data.auto_scroll = {
    scroll_records: [{ worker_id: 'fetch-1', display_label: 'fetch-a1', enabled: true, passes: 3 }],
    total_scrolled: 1,
    total_skipped: 0,
  };
  const props = harness.selectProps.auto_scroll({ data, persistScope: harness.persistScope });
  assert.deepStrictEqual(props.data, data.auto_scroll);
  assert.strictEqual(props.persistScope, harness.persistScope);
});

test('auto_scroll selector returns empty fallback when data is undefined', async () => {
  const harness = await createFetchHarness();
  const props = harness.selectProps.auto_scroll({ data: undefined, persistScope: harness.persistScope });
  assert.ok(props.data && typeof props.data === 'object');
  assert.deepStrictEqual(props.data.records, []);
  assert.strictEqual(props.data.total, 0);
});

test('dom_expansion selector extracts dom_expansion data from context', async () => {
  const harness = await createFetchHarness();
  const data = createFetchData();
  data.dom_expansion = {
    expansion_records: [{ worker_id: 'fetch-1', display_label: 'fetch-a1', enabled: true, found: 5, clicked: 4 }],
    total_expanded: 1,
    total_skipped: 0,
    total_clicks: 4,
    total_found: 5,
  };
  const props = harness.selectProps.dom_expansion({ data, persistScope: harness.persistScope });
  assert.deepStrictEqual(props.data, data.dom_expansion);
  assert.strictEqual(props.persistScope, harness.persistScope);
});

test('dom_expansion selector returns empty fallback when data is undefined', async () => {
  const harness = await createFetchHarness();
  const props = harness.selectProps.dom_expansion({ data: undefined, persistScope: harness.persistScope });
  assert.ok(props.data && typeof props.data === 'object');
  assert.deepStrictEqual(props.data.records, []);
  assert.strictEqual(props.data.total, 0);
});

test('css_override selector extracts css_override data from context', async () => {
  const harness = await createFetchHarness();
  const data = createFetchData();
  data.css_override = {
    override_records: [{ worker_id: 'fetch-1', display_label: 'fetch-a1', enabled: true, hiddenBefore: 8, revealedAfter: 8 }],
    total_overridden: 1,
    total_skipped: 0,
    total_elements_revealed: 8,
  };
  const props = harness.selectProps.css_override({ data, persistScope: harness.persistScope });
  assert.deepStrictEqual(props.data, data.css_override);
  assert.strictEqual(props.persistScope, harness.persistScope);
});

test('css_override selector returns empty fallback when data is undefined', async () => {
  const harness = await createFetchHarness();
  const props = harness.selectProps.css_override({ data: undefined, persistScope: harness.persistScope });
  assert.ok(props.data && typeof props.data === 'object');
  assert.deepStrictEqual(props.data.records, []);
  assert.strictEqual(props.data.total, 0);
});
