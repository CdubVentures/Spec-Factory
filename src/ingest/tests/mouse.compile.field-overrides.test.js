import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertSubsetDeep,
  compileCategoryFieldStudio,
  createMouseCompileWorkspace,
  saveFieldStudioMap,
} from '../../../test/helpers/categoryCompileHarness.js';

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
    const runtimeRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.runtime.json'), 'utf8'));

    assert.deepEqual(fieldRules?.fields?.connection?.consumers, {
      'contract.type': {
        seed: false,
      },
      'enum.policy': {
        indexlab: false,
        review: false,
      },
    });
    assert.deepEqual(runtimeRules?.fields?.connection?.consumers, fieldRules?.fields?.connection?.consumers);
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

test('compileCategoryFieldStudio applies field_studio_map field_overrides for latency/force fields', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-category-compile-overrides-',
  });
  const { helperRoot, fieldStudioSourcePath, fieldStudioMap, generatedRoot, cleanup } = workspace;
  const inlineOverrides = {
    click_latency: {
      priority: { required_level: 'expected', availability: 'sometimes', difficulty: 'hard', effort: 8 },
      contract: { type: 'number', shape: 'scalar', unit: 'ms', rounding: { decimals: 2, mode: 'nearest' }, value_form: 'single' },
      parse: { template: 'number_with_unit', unit: 'ms', unit_accepts: ['ms'], strict_unit_required: true },
      evidence: { required: true, min_evidence_refs: 1, tier_preference: ['tier2', 'tier1', 'tier3'], conflict_policy: 'resolve_by_tier_else_unknown' },
      selection_policy: { source_field: 'click_latency_list' },
    },
    click_latency_list: {
      priority: { required_level: 'optional', availability: 'sometimes', difficulty: 'hard', effort: 9 },
      contract: {
        type: 'object',
        shape: 'list',
        unit: 'ms',
        value_form: 'set',
        object_schema: {
          mode: { type: 'string' },
          ms: { type: 'number' },
          source_host: { type: 'string', required: false },
          method: { type: 'string', required: false },
        },
      },
      parse: { template: 'latency_list_modes_ms' },
      evidence: { required: true, min_evidence_refs: 1, tier_preference: ['tier2', 'tier1', 'tier3'], conflict_policy: 'preserve_all_candidates' },
    },
    sensor_latency_list: {
      priority: { required_level: 'optional', availability: 'sometimes', difficulty: 'hard', effort: 9 },
      contract: {
        type: 'object',
        shape: 'list',
        unit: 'ms',
        value_form: 'set',
        object_schema: {
          mode: { type: 'string' },
          ms: { type: 'number' },
          source_host: { type: 'string', required: false },
          method: { type: 'string', required: false },
        },
      },
      parse: { template: 'latency_list_modes_ms' },
    },
    click_force: {
      priority: { required_level: 'optional', availability: 'rare', difficulty: 'hard', effort: 6 },
      contract: { type: 'number', shape: 'scalar', unit: 'gf', rounding: { decimals: 0, mode: 'nearest' }, value_form: 'single' },
      parse: { template: 'number_with_unit', unit: 'gf', unit_accepts: ['gf', 'g'], strict_unit_required: true },
    },
  };
  fieldStudioMap.field_overrides = inlineOverrides;

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
    const clickLatencyList = fieldRules.fields?.click_latency_list || {};
    const sensorLatencyList = fieldRules.fields?.sensor_latency_list || {};
    const clickForce = fieldRules.fields?.click_force || {};
    assert.equal(clickLatency?.contract?.shape || clickLatency?.shape, 'scalar');
    assert.equal(clickLatencyList?.contract?.shape || clickLatencyList?.shape, 'list');
    assert.equal(clickLatencyList?.parse?.template || clickLatencyList?.parse_template, 'latency_list_modes_ms');
    assert.equal(sensorLatencyList?.parse?.template || sensorLatencyList?.parse_template, 'latency_list_modes_ms');
    assert.equal(clickForce?.contract?.unit || clickForce?.unit, 'gf');
    assert.equal(clickLatency?.selection_policy?.source_field, 'click_latency_list');
  } finally {
    await cleanup();
  }
});

test('compileCategoryFieldStudio merges enum.additional_values from saved map field_overrides into known_values', async () => {
  const workspace = await createMouseCompileWorkspace({
    tempPrefix: 'spec-harvester-enum-addval-',
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
        enum: {
          policy: 'open_prefer_known',
          additional_values: ['bluetooth_5_3', 'usb_c_dongle'],
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

    const knownValues = JSON.parse(await fs.readFile(path.join(generatedRoot, 'known_values.json'), 'utf8'));
    const connectionValues = knownValues.fields?.connection || knownValues.enums?.connection?.values || [];
    assert.equal(
      connectionValues.includes('bluetooth_5_3'),
      true,
      `known_values for connection should include 'bluetooth_5_3' from additional_values, got: ${JSON.stringify(connectionValues)}`,
    );
    assert.equal(
      connectionValues.includes('usb_c_dongle'),
      true,
      `known_values for connection should include 'usb_c_dongle' from additional_values, got: ${JSON.stringify(connectionValues)}`,
    );
  } finally {
    await cleanup();
  }
});
