import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
} from './helpers/categoryCompileHarness.js';

test('compileCategoryFieldStudio rejects cyclic key migration maps', async () => {
  const workspace = await createMouseCompileWorkspace({
    localWorkbook: true,
    tempPrefix: 'spec-harvester-category-compile-key-cycle-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, cleanup } = workspace;
  fieldStudioMap.selected_keys = ['connection', 'weight'];
  fieldStudioMap.field_overrides = {
    connection: {
      canonical_key: 'weight',
      ui: {
        label: 'connection',
      },
    },
    weight: {
      canonical_key: 'connection',
      ui: {
        label: 'weight',
      },
    },
  };

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

    assert.equal(result.compiled, false);
    assert.equal(
      (result.errors || []).some((row) => String(row).includes('key_migrations: cycle detected')),
      true,
    );
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio keeps key migrations aligned to generated field keys', async () => {
  const workspace = await createMouseCompileWorkspace({
    localWorkbook: true,
    tempPrefix: 'spec-harvester-category-compile-key-map-align-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.selected_keys = ['lngth'];
  fieldStudioMap.field_overrides = {
    ...(fieldStudioMap.field_overrides || {}),
    lngth: {
      canonical_key: 'length',
      ui: {
        label: 'Length',
      },
    },
  };

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
    assert.equal(result.compiled, true, JSON.stringify(result.errors || []));

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const keyMigrations = JSON.parse(await fs.readFile(path.join(generatedRoot, 'key_migrations.json'), 'utf8'));
    const keyMap = keyMigrations?.key_map || {};

    assert.equal(Boolean(fieldRules?.fields?.lngth), true, 'fixture should still compile lngth field key');
    assert.equal(keyMap.length, 'lngth', 'canonical alias should migrate to generated key');
    assert.equal(
      Object.prototype.hasOwnProperty.call(keyMap, 'lngth'),
      false,
      'migration target must be a real generated key',
    );
  } finally {
    await cleanup();
  }
});
