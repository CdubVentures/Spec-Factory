import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';
import { PAGE_REGISTRY_MODULE_STUBS } from './pageRegistryModuleStubs.js';

let mod;

async function getModule() {
  if (mod) return mod;
  mod = await loadBundledModule('tools/gui-react/src/registries/pageRegistry.ts', {
    prefix: 'page-registry-contract-',
    stubs: PAGE_REGISTRY_MODULE_STUBS,
  });
  return mod;
}

describe('PAGE_REGISTRY structural invariants', () => {
  it('is a non-empty registry with catalog and ops entries', async () => {
    const { PAGE_REGISTRY } = await getModule();
    assert.ok(Array.isArray(PAGE_REGISTRY), 'PAGE_REGISTRY must be an array');
    assert.ok(PAGE_REGISTRY.length > 0, 'PAGE_REGISTRY must not be empty');
    assert.ok(PAGE_REGISTRY.some((entry) => entry.tabGroup === 'catalog'));
    assert.ok(PAGE_REGISTRY.some((entry) => entry.tabGroup === 'ops'));
  });

  it('every entry has required fields with correct types', async () => {
    const { PAGE_REGISTRY } = await getModule();
    for (const entry of PAGE_REGISTRY) {
      assert.equal(typeof entry.path, 'string', `path must be string, got ${typeof entry.path}`);
      assert.ok(entry.path.length > 0, 'path must be non-empty');
      assert.equal(typeof entry.label, 'string', `label must be string, got ${typeof entry.label}`);
      assert.ok(entry.label.length > 0, 'label must be non-empty');
      assert.equal(typeof entry.tabGroup, 'string', `tabGroup must be string, got ${typeof entry.tabGroup}`);
      assert.equal(typeof entry.loader, 'function', `loader must be function, got ${typeof entry.loader}`);
      assert.equal(typeof entry.exportName, 'string', `exportName must be string, got ${typeof entry.exportName}`);
      assert.ok(entry.exportName.length > 0, 'exportName must be non-empty');
    }
  });

  it('every path is unique', async () => {
    const { PAGE_REGISTRY } = await getModule();
    const paths = PAGE_REGISTRY.map((entry) => entry.path);
    assert.equal(new Set(paths).size, paths.length, `duplicate paths found: ${paths}`);
  });

  it('tabGroup values are only catalog, ops, or settings', async () => {
    const { PAGE_REGISTRY } = await getModule();
    const allowed = new Set(['catalog', 'ops', 'settings']);
    for (const entry of PAGE_REGISTRY) {
      assert.ok(allowed.has(entry.tabGroup), `unexpected tabGroup "${entry.tabGroup}" on ${entry.path}`);
    }
  });

  it('optional boolean fields are boolean or undefined', async () => {
    const { PAGE_REGISTRY } = await getModule();
    const optionalBooleans = ['disabledOnAll', 'disabledOnTest', 'dividerAfter', 'dividerBefore'];
    for (const entry of PAGE_REGISTRY) {
      for (const key of optionalBooleans) {
        const value = entry[key];
        assert.ok(
          value === undefined || typeof value === 'boolean',
          `${entry.path}.${key} must be boolean or undefined, got ${typeof value}`,
        );
      }
    }
  });
});

describe('CATALOG_TABS derivation', () => {
  it('contains exactly the catalog registry entries in registry order', async () => {
    const { PAGE_REGISTRY, CATALOG_TABS } = await getModule();
    const expected = PAGE_REGISTRY
      .filter((entry) => entry.tabGroup === 'catalog')
      .map((entry) => ({ path: entry.path, label: entry.label }));

    assert.deepEqual(
      CATALOG_TABS.map((tab) => ({ path: tab.path, label: tab.label })),
      expected,
    );
  });

  it('preserves divider metadata', async () => {
    const { PAGE_REGISTRY, CATALOG_TABS } = await getModule();
    const expected = Object.fromEntries(
      PAGE_REGISTRY
        .filter((entry) => entry.tabGroup === 'catalog')
        .map((entry) => [entry.label, entry.dividerAfter]),
    );
    const actual = Object.fromEntries(CATALOG_TABS.map((tab) => [tab.label, tab.dividerAfter]));

    assert.deepEqual(actual, expected);
  });

  it('preserves disabled flags', async () => {
    const { PAGE_REGISTRY, CATALOG_TABS } = await getModule();
    const expected = Object.fromEntries(
      PAGE_REGISTRY
        .filter((entry) => entry.tabGroup === 'catalog')
        .map((entry) => [
          entry.label,
          {
            disabledOnAll: entry.disabledOnAll,
            disabledOnTest: entry.disabledOnTest,
          },
        ]),
    );
    const actual = Object.fromEntries(
      CATALOG_TABS.map((tab) => [
        tab.label,
        {
          disabledOnAll: tab.disabledOnAll,
          disabledOnTest: tab.disabledOnTest,
        },
      ]),
    );

    assert.deepEqual(actual, expected);
  });
});

describe('OPS_TABS derivation', () => {
  it('contains exactly the ops registry entries in registry order', async () => {
    const { PAGE_REGISTRY, OPS_TABS } = await getModule();
    const expected = PAGE_REGISTRY
      .filter((entry) => entry.tabGroup === 'ops')
      .map((entry) => ({ path: entry.path, label: entry.label }));

    assert.deepEqual(
      OPS_TABS.map((tab) => ({ path: tab.path, label: tab.label })),
      expected,
    );
  });

  it('preserves divider metadata', async () => {
    const { PAGE_REGISTRY, OPS_TABS } = await getModule();
    const expected = Object.fromEntries(
      PAGE_REGISTRY
        .filter((entry) => entry.tabGroup === 'ops')
        .map((entry) => [entry.label, { dividerAfter: entry.dividerAfter, dividerBefore: entry.dividerBefore }]),
    );
    const actual = Object.fromEntries(
      OPS_TABS.map((tab) => [tab.label, { dividerAfter: tab.dividerAfter, dividerBefore: tab.dividerBefore }]),
    );

    assert.deepEqual(actual, expected);
  });

  it('preserves disabled flags', async () => {
    const { PAGE_REGISTRY, OPS_TABS } = await getModule();
    const expected = Object.fromEntries(
      PAGE_REGISTRY
        .filter((entry) => entry.tabGroup === 'ops')
        .map((entry) => [
          entry.label,
          {
            disabledOnAll: entry.disabledOnAll,
            disabledOnTest: entry.disabledOnTest,
          },
        ]),
    );
    const actual = Object.fromEntries(
      OPS_TABS.map((tab) => [
        tab.label,
        {
          disabledOnAll: tab.disabledOnAll,
          disabledOnTest: tab.disabledOnTest,
        },
      ]),
    );

    assert.deepEqual(actual, expected);
  });
});

describe('ROUTE_ENTRIES derivation', () => {
  it('does not contain test-mode', async () => {
    const { ROUTE_ENTRIES } = await getModule();
    const paths = ROUTE_ENTRIES.map((entry) => entry.path);
    assert.ok(!paths.includes('/test-mode'), 'test-mode must not be in ROUTE_ENTRIES');
    assert.ok(!paths.includes('test-mode'), 'test-mode must not be in ROUTE_ENTRIES');
  });

  it('derives route entries directly from the registry page paths and export names', async () => {
    const { PAGE_REGISTRY, ROUTE_ENTRIES } = await getModule();
    assert.deepEqual(
      ROUTE_ENTRIES.map((entry) => ({
        path: entry.path,
        exportName: entry.exportName,
      })),
      PAGE_REGISTRY.map((entry) => ({
        path: entry.path,
        exportName: entry.exportName,
      })),
    );
  });

  it('index route (path /) has isIndex === true', async () => {
    const { ROUTE_ENTRIES } = await getModule();
    const indexEntry = ROUTE_ENTRIES.find((entry) => entry.path === '/');
    assert.ok(indexEntry, 'must have an index route with path /');
    assert.equal(indexEntry.isIndex, true);
  });

  it('non-index routes have isIndex === false', async () => {
    const { ROUTE_ENTRIES } = await getModule();
    const nonIndexEntries = ROUTE_ENTRIES.filter((entry) => entry.path !== '/');
    assert.ok(nonIndexEntries.length > 0, 'must have non-index routes');
    for (const entry of nonIndexEntries) {
      assert.equal(entry.isIndex, false, `${entry.path} should have isIndex === false`);
    }
  });

  it('every entry has loader (function) and exportName (string)', async () => {
    const { ROUTE_ENTRIES } = await getModule();
    for (const entry of ROUTE_ENTRIES) {
      assert.equal(typeof entry.loader, 'function', `${entry.path} loader must be function`);
      assert.equal(typeof entry.exportName, 'string', `${entry.path} exportName must be string`);
      assert.ok(entry.exportName.length > 0, `${entry.path} exportName must be non-empty`);
    }
  });
});
