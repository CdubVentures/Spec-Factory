import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertSubsetDeep,
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
} from './helpers/categoryCompileHarness.js';

test('compileCategoryFieldStudio preserves saved map field_overrides consumers in generated field rules', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-consumers-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;

  try {
    await saveFieldStudioMap({
      category: 'mouse',
      fieldStudioMap,
      config: { categoryAuthorityRoot: helperRoot },
    });

    fieldStudioMap.field_overrides = {
      ...(fieldStudioMap.field_overrides || {}),
      connection: {
        consumers: {
          'contract.type': {
            seed: false,
          },
          'enum.policy': {
            indexlab: false,
            review: false,
          },
        },
      },
    };
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

    assert.deepEqual(fieldRules?.fields?.connection?.consumers, {
      'contract.type': {
        seed: false,
      },
      'enum.policy': {
        indexlab: false,
        review: false,
      },
    });
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio preserves product_image_dependent in generated field rules', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-pif-image-dep-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;

  try {
    fieldStudioMap.field_overrides = {
      ...(fieldStudioMap.field_overrides || {}),
      connection: {
        ...(fieldStudioMap.field_overrides?.connection || {}),
        product_image_dependent: true,
      },
    };
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
    assert.equal(fieldRules?.fields?.connection?.product_image_dependent, true);
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio hard-fails invalid override contract', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-invalid-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, cleanup } = workspace;
  fieldStudioMap.field_overrides = {
    connection: {
      type: 'made_up_type',
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
      (result.errors || []).some((row) => String(row).includes('invalid type')),
      true,
    );
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio forces boolean fields to closed yes_no even when overrides ask for open discovery', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-boolean-enum-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  fieldStudioMap.field_overrides = {
    side_buttons: {
      type: 'string',
      data_type: 'string',
      shape: 'list',
      contract: { type: 'boolean', shape: 'list' },
      enum_policy: 'open_prefer_known',
      enum_source: { type: 'known_values', ref: 'side_buttons' },
      enum: { policy: 'open_prefer_known', source: 'data_lists.side_buttons' },
      new_value_policy: {
        accept_if_evidence: true,
        mark_needs_curation: true,
      },
      vocab: {
        mode: 'open_prefer_known',
        allow_new: true,
        known_values: ['no'],
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
    const knownValues = JSON.parse(await fs.readFile(path.join(generatedRoot, 'known_values.json'), 'utf8'));
    const rule = fieldRules.fields.side_buttons;

    assert.equal(rule.contract.type, 'boolean');
    assert.equal(rule.contract.shape, 'scalar');
    assert.equal(rule.enum.policy, 'closed');
    assert.equal(rule.enum.source, 'yes_no');
    assert.equal(rule.enum.new_value_policy, undefined);
    assert.deepEqual(knownValues.enums.yes_no.values, ['n/a', 'no', 'yes']);
    assert.equal(knownValues.enums.yes_no.policy, 'closed');
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio applies field_studio_map field_overrides for latency/force fields', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-overrides-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  const inlineOverrides = {
    click_latency: {
      priority: { required_level: 'non_mandatory', availability: 'sometimes', difficulty: 'hard' },
      contract: { type: 'number', shape: 'scalar', unit: 'ms', rounding: { decimals: 2, mode: 'nearest' }, value_form: 'single' },
      parse: {},
      evidence: { min_evidence_refs: 1, tier_preference: ['tier2', 'tier1', 'tier3'] },
    },
    click_latency_wired: {
      priority: { required_level: 'non_mandatory', availability: 'sometimes', difficulty: 'hard' },
      contract: { type: 'number', shape: 'scalar', unit: 'ms', rounding: { decimals: 2, mode: 'nearest' }, value_form: 'single' },
      parse: {},
    },
    sensor_latency_wired: {
      priority: { required_level: 'non_mandatory', availability: 'sometimes', difficulty: 'hard' },
      contract: { type: 'number', shape: 'scalar', unit: 'ms', rounding: { decimals: 2, mode: 'nearest' }, value_form: 'single' },
      parse: {},
    },
    click_force: {
      priority: { required_level: 'non_mandatory', availability: 'rare', difficulty: 'hard' },
      contract: { type: 'number', shape: 'scalar', unit: 'gf', rounding: { decimals: 0, mode: 'nearest' }, value_form: 'single' },
      parse: {},
    },
  };
  fieldStudioMap.field_overrides = inlineOverrides;
  // WHY: New latency scalar fields must be in selected_keys for the compiler to include them.
  if (!fieldStudioMap.selected_keys.includes('click_latency_wired')) {
    fieldStudioMap.selected_keys.push('click_latency_wired', 'sensor_latency_wired');
  }

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
    for (const [fieldKey, expectedRule] of Object.entries(inlineOverrides)) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(fieldRules.fields || {}, fieldKey),
        true,
        `generated field missing ${fieldKey}`,
      );
      assertSubsetDeep(expectedRule, fieldRules.fields[fieldKey], `field_rules.fields.${fieldKey}`);
    }

    const clickLatency = fieldRules.fields?.click_latency || {};
    const clickLatencyWired = fieldRules.fields?.click_latency_wired || {};
    const sensorLatencyWired = fieldRules.fields?.sensor_latency_wired || {};
    const clickForce = fieldRules.fields?.click_force || {};
    assert.equal(clickLatency?.contract?.shape || clickLatency?.shape, 'scalar');
    assert.equal(clickLatencyWired?.contract?.shape || clickLatencyWired?.shape, 'scalar');
    assert.equal(clickLatencyWired?.contract?.type || clickLatencyWired?.type, 'number');
    assert.equal(sensorLatencyWired?.contract?.type || sensorLatencyWired?.type, 'number');
    assert.equal(clickForce?.contract?.unit || clickForce?.unit, 'gf');
  } finally {
    await cleanup();
  }
});
