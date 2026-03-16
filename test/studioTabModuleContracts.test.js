import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadMappingStudioTabModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/MappingStudioTab.tsx',
    {
      prefix: 'mapping-studio-tab-',
    },
  );
}

async function loadKeyNavigatorTabModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/KeyNavigatorTab.tsx',
    {
      prefix: 'key-navigator-tab-',
    },
  );
}

test('MappingStudioTab bundles as an independent component module', async () => {
  const module = await loadMappingStudioTabModule();
  assert.equal(typeof module.MappingStudioTab, 'function');
});

test('KeyNavigatorTab bundles as an independent component module', async () => {
  const module = await loadKeyNavigatorTabModule();
  assert.equal(typeof module.KeyNavigatorTab, 'function');
});
