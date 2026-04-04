import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
} from './helpers/categoryCompileHarness.js';

test('compileCategoryFieldStudio honors selected_keys scope from field studio map', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-selected-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.selected_keys = ['connection', 'weight'];
  fieldStudioMap.component_sources = [];

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);
    // WHY: EG-locked keys (colors, editions) are always injected into the selected set,
    // so the total is selected_keys + EG_LOCKED_KEYS = 2 + 2 = 4.
    assert.equal(result.selected_key_count, 4);
    assert.equal(result.field_count, 4);

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.deepEqual(Object.keys(fieldRules.fields).sort(), ['colors', 'connection', 'editions', 'weight']);
  } finally {
    await cleanup();
  }
});
