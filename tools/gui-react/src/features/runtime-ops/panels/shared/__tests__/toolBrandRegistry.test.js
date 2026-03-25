import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const REQUIRED_TOOLS = ['playwright', 'crawlee', 'specFactory'];

function buildLogoStub(name) {
  return `export function ${name}() { return null; }`;
}

async function createRegistryHarness() {
  if (!createRegistryHarness.promise) {
    createRegistryHarness.promise = loadBundledModule(
      'tools/gui-react/src/features/runtime-ops/panels/shared/toolBrandRegistry.ts',
      {
        prefix: 'tool-brand-',
        stubs: {
          './toolLogos.tsx': [
            buildLogoStub('PlaywrightLogo'),
            buildLogoStub('CrawleeLogo'),
            buildLogoStub('SpecFactoryLogo'),
            buildLogoStub('ScriptIcon'),
          ].join('\n'),
        },
      },
    );
  }
  return createRegistryHarness.promise;
}

createRegistryHarness.promise = null;

test('TOOL_BRAND_REGISTRY contains required tool entries', async () => {
  const mod = await createRegistryHarness();
  for (const key of REQUIRED_TOOLS) {
    assert.ok(mod.TOOL_BRAND_REGISTRY[key], `missing required tool: ${key}`);
  }
});

test('every registry entry has non-empty name and description', async () => {
  const mod = await createRegistryHarness();
  for (const [key, entry] of Object.entries(mod.TOOL_BRAND_REGISTRY)) {
    assert.ok(typeof entry.name === 'string' && entry.name.length > 0, `${key}: name must be non-empty`);
    assert.ok(typeof entry.description === 'string' && entry.description.length > 0, `${key}: description must be non-empty`);
  }
});

test('every registry entry has a Logo component', async () => {
  const mod = await createRegistryHarness();
  for (const [key, entry] of Object.entries(mod.TOOL_BRAND_REGISTRY)) {
    assert.equal(typeof entry.Logo, 'function', `${key}: Logo must be a function component`);
  }
});

test('entries with non-empty url have valid URL format', async () => {
  const mod = await createRegistryHarness();
  for (const [key, entry] of Object.entries(mod.TOOL_BRAND_REGISTRY)) {
    if (entry.url && entry.url.length > 0) {
      assert.doesNotThrow(() => new URL(entry.url), `${key}: url "${entry.url}" is not a valid URL`);
    }
  }
});

test('resolveToolBrand returns entry for known key', async () => {
  const mod = await createRegistryHarness();
  const entry = mod.resolveToolBrand('playwright');
  assert.ok(entry);
  assert.equal(entry.name, 'Playwright');
});

test('resolveToolBrand returns undefined for unknown key', async () => {
  const mod = await createRegistryHarness();
  assert.equal(mod.resolveToolBrand('nonexistent'), undefined);
});
