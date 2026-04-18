// WHY: Defines the contract for the `component_only` flag on
// `component_sources[*].roles.properties[*]`. When true, the property MUST stay
// scoped to the component DB (encoder/switch/sensor) and MUST NOT promote to
// product-level field rules, the UI field catalog, Key Navigator, or the Review
// grid. This decouples component attributes from product fields so authors can
// model deep component specs without polluting the product schema.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
} from './helpers/categoryCompileHarness.js';

function buildEncoderSourceWithProps(properties) {
  return {
    type: 'encoder',
    sheet: 'encoder',
    auto_derive_aliases: true,
    header_row: 1,
    first_data_row: 2,
    stop_after_blank_primary: 10,
    roles: {
      primary_identifier: 'C',
      maker: 'B',
      aliases: [],
      links: ['G'],
      properties,
    },
  };
}

test('component_only:true property does NOT promote to fieldRules.fields or ui_field_catalog', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-excludes-from-runtime-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: [], component_only: true },
    ]),
  ];

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
    assert.equal(
      fieldRules?.fields?.encoder_steps,
      undefined,
      'component_only property must NOT appear in field_rules.fields',
    );

    const uiFieldCatalog = JSON.parse(await fs.readFile(path.join(generatedRoot, 'ui_field_catalog.json'), 'utf8'));
    assert.equal(
      uiFieldCatalog?.fields?.encoder_steps,
      undefined,
      'component_only property must NOT appear in ui_field_catalog.fields',
    );
  } finally {
    await cleanup();
  }
});

test('component_only:true property STILL appears in component_db_sources roles.properties', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-stays-in-component-db-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: [], component_only: true },
    ]),
  ];

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

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const props = fieldRules?.component_db_sources?.encoder?.roles?.properties || [];
    const found = props.find((p) => (p.field_key || p.key) === 'encoder_steps');
    assert.ok(found, 'component_only property must still appear in component_db_sources for the component');
  } finally {
    await cleanup();
  }
});

test('component_only:false (default) property STILL promotes — regression guard', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-default-promotes-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: [] },
    ]),
  ];

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

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.ok(
      fieldRules?.fields?.encoder_steps,
      'property without component_only flag must continue to promote to field_rules.fields',
    );
  } finally {
    await cleanup();
  }
});

test('mixed: component_only:true and false on same source — only flagged ones excluded', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-mixed-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: [], component_only: true },
      { column: 'F', field_key: 'encoder', type: 'string', unit: '', variance_policy: 'authoritative', constraints: [] },
    ]),
  ];

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

    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.encoder_steps, undefined, 'flagged property excluded');
    assert.ok(fieldRules?.fields?.encoder, 'unflagged property still promoted');
  } finally {
    await cleanup();
  }
});

test('component_only:true with non-empty constraints emits a warning (constraints not enforced cross-validation)', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-constraint-warn-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: ['encoder_steps <= 100'], component_only: true },
    ]),
  ];

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

    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const found = warnings.some((w) => String(w).includes('encoder_steps') && String(w).includes('component_only') && String(w).includes('constraint'));
    assert.ok(found, `expected warning about constraints on component_only property; got: ${JSON.stringify(warnings)}`);
  } finally {
    await cleanup();
  }
});

test('component_only:true on key in selected_keys auto-prunes selected_keys with warning at save', async () => {
  // WHY: Pruning happens at normalization time (save). The compile then sees
  // an already-clean map. We assert the SAVE result emits the warning AND
  // the saved file no longer contains the key in selected_keys.
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-prune-selected-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.selected_keys = [...(fieldStudioMap.selected_keys || []), 'encoder_steps'];
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'encoder_steps', type: 'number', unit: '', variance_policy: 'authoritative', constraints: [], component_only: true },
    ]),
  ];

  try {
    const saveResult = await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });
    const saveWarnings = Array.isArray(saveResult.warnings) ? saveResult.warnings : [];
    const found = saveWarnings.some((w) => String(w).includes('encoder_steps') && String(w).includes('selected_keys'));
    assert.ok(found, `expected save warning about selected_keys removal; got: ${JSON.stringify(saveWarnings)}`);
    assert.equal(
      saveResult.field_studio_map.selected_keys.includes('encoder_steps'),
      false,
      'saved map.selected_keys must not contain pruned key',
    );

    const result = await compileCategoryFieldStudio({
      category: 'mouse',
      fieldStudioSourcePath,
      config: { categoryAuthorityRoot: helperRoot },
    });
    assert.equal(result.compiled, true);

    // The key must NOT appear in field_rules.fields after compile either
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.equal(fieldRules?.fields?.encoder_steps, undefined, 'pruned key must not appear in field_rules.fields');
  } finally {
    await cleanup();
  }
});

test('component_only:true on EG-locked key emits warning and the EG key still promotes', async () => {
  // WHY: colors / editions / release_date are variant generators that MUST stay
  // as product fields. Marking them component_only is invalid intent — warn but
  // don't break the promotion.
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'component-only-eg-locked-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.component_sources = [
    buildEncoderSourceWithProps([
      { column: 'E', field_key: 'release_date', type: 'string', unit: '', variance_policy: 'authoritative', constraints: [], component_only: true },
    ]),
  ];

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

    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const found = warnings.some((w) => String(w).includes('release_date') && String(w).includes('component_only') && (String(w).includes('EG') || String(w).includes('locked')));
    assert.ok(found, `expected warning about EG-locked component_only; got: ${JSON.stringify(warnings)}`);

    // EG keys are auto-injected — release_date must still appear regardless
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    assert.ok(fieldRules?.fields?.release_date, 'EG-locked key must still appear in field_rules.fields');
  } finally {
    await cleanup();
  }
});
