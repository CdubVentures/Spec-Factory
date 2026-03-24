import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceColor } from '../confidenceColor.js';
import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
  resolvePropertyFieldMeta,
  writeComponentReviewItems,
} from '../../tests/helpers/componentReviewHarness.js';

test('edge case - :: delimiter in component name produces ambiguous identifier', () => {
  const identifier = buildComponentIdentifier('sensor', 'Type::A::Model', 'Maker::X');
  assert.strictEqual(identifier, 'sensor::Type::A::Model::Maker::X');

  const parts = identifier.split('::');
  assert.ok(
    parts.length > 3,
    `identifier with :: in name/maker splits into ${parts.length} parts, making naive split('::') ambiguous`,
  );
});

test('edge case - safe identifiers have exactly 3 :: delimited parts', () => {
  const safeId = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
  const safeParts = safeId.split('::');
  assert.strictEqual(safeParts.length, 3, 'safe identifier should have exactly 3 parts when split on ::');

  const ambiguousId = buildComponentIdentifier('sensor', 'PAW::3950', 'PixArt');
  const ambiguousParts = ambiguousId.split('::');
  assert.ok(ambiguousParts.length > 3, 'identifier with :: in name produces >3 parts, signaling ambiguity');
});

test('edge case - confidence boundary values map to correct colors', () => {
  assert.strictEqual(confidenceColor(0.0, []), 'gray', 'confidence 0.0 should be gray');
  assert.strictEqual(confidenceColor(0.5, []), 'red', 'confidence 0.5 should be red');
  assert.strictEqual(confidenceColor(0.59, []), 'red', 'confidence 0.59 should be red');
  assert.strictEqual(confidenceColor(0.6, []), 'yellow', 'confidence 0.6 should be yellow');
  assert.strictEqual(confidenceColor(0.8, []), 'yellow', 'confidence 0.8 should be yellow');
  assert.strictEqual(confidenceColor(0.84, []), 'yellow', 'confidence 0.84 should be yellow');
  assert.strictEqual(confidenceColor(0.85, []), 'green', 'confidence 0.85 should be green');
  assert.strictEqual(confidenceColor(1.0, []), 'green', 'confidence 1.0 should be green');
  assert.strictEqual(confidenceColor(0.95, ['variance_violation']), 'red', 'variance_violation should force red regardless of confidence');
  assert.strictEqual(confidenceColor(0.95, ['dependency_missing']), 'red', 'dependency_missing should force red regardless of confidence');
});

test('edge case - confidence boundaries in component payload slots', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'sensor';
    const boundaries = [
      { name: 'ZeroConf', confidence: 0, expected: 'gray' },
      { name: 'LowConf', confidence: 0.5, expected: 'red' },
      { name: 'MidConf', confidence: 0.8, expected: 'yellow' },
      { name: 'HighConf', confidence: 1.0, expected: 'green' },
    ];

    for (const { name, confidence } of boundaries) {
      specDb.upsertComponentIdentity({
        componentType,
        canonicalName: name,
        maker: 'TestMaker',
        links: null,
        source: 'test',
      });
      specDb.upsertComponentValue({
        componentType,
        componentName: name,
        componentMaker: 'TestMaker',
        propertyKey: 'dpi_max',
        value: '16000',
        confidence,
        variancePolicy: null,
        source: 'pipeline',
        acceptedCandidateId: null,
        needsReview: confidence < 0.85,
        overridden: false,
        constraints: [],
      });
    }

    await writeComponentReviewItems(tempRoot, []);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });

    for (const { name, expected } of boundaries) {
      const row = payload.items.find((item) => item.name === name);
      assert.ok(row, `row for ${name} should exist`);
      const prop = row.properties?.dpi_max;
      if (prop?.selected?.color) {
        assert.strictEqual(
          prop.selected.color,
          expected,
          `${name} with boundary confidence should map to ${expected}, got ${prop.selected.color}`,
        );
      }
    }
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('resolvePropertyFieldMeta returns variance_policy and constraints from field definition', () => {
  const fieldRules = {
    rules: {
      fields: {
        dpi: {
          variance_policy: 'upper_bound',
          constraints: [],
        },
      },
    },
    knownValues: { enums: {} },
  };
  const result = resolvePropertyFieldMeta('dpi', fieldRules);
  assert.deepStrictEqual(result, {
    variance_policy: 'upper_bound',
    constraints: [],
    enum_values: null,
    enum_policy: null,
  });
});

test('resolvePropertyFieldMeta returns enum_values and enum_policy for enum fields', () => {
  const fieldRules = {
    rules: {
      fields: {
        encoder_type: {
          variance_policy: 'authoritative',
          constraints: [],
          enum: { policy: 'closed', source: 'data_lists.encoder_type' },
        },
      },
    },
    knownValues: {
      enums: {
        encoder_type: { policy: 'closed', values: ['optical', 'mechanical'] },
      },
    },
  };
  const result = resolvePropertyFieldMeta('encoder_type', fieldRules);
  assert.deepStrictEqual(result, {
    variance_policy: 'authoritative',
    constraints: [],
    enum_values: ['optical', 'mechanical'],
    enum_policy: 'closed',
  });
});

test('resolvePropertyFieldMeta returns null for unknown key', () => {
  const fieldRules = {
    rules: { fields: { dpi: { variance_policy: 'upper_bound', constraints: [] } } },
    knownValues: { enums: {} },
  };
  assert.strictEqual(resolvePropertyFieldMeta('nonexistent_key', fieldRules), null);
});

test('resolvePropertyFieldMeta returns null for identity key __name', () => {
  const fieldRules = {
    rules: { fields: { __name: { variance_policy: null, constraints: [] } } },
    knownValues: { enums: {} },
  };
  assert.strictEqual(resolvePropertyFieldMeta('__name', fieldRules), null);
});

test('component payload inherits constraints from field rules, not DB row', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'TestSensor',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'TestSensor',
      componentMaker: 'TestMaker',
      propertyKey: 'sensor_date',
      value: '2024-01',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: null,
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-constraints',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'TestSensor',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          sensor_date: {
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date'],
          },
        },
      },
      knownValues: { enums: {} },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestSensor' && item.maker === 'TestMaker');
    assert.ok(row, 'expected TestSensor/TestMaker row');
    assert.deepStrictEqual(
      row.properties.sensor_date.constraints,
      ['sensor_date <= release_date'],
      'constraints should come from field rules',
    );
    assert.strictEqual(
      row.properties.sensor_date.variance_policy,
      'authoritative',
      'variance_policy should come from DB row (component-level)',
    );
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload includes enum_values and enum_policy from field rules', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'encoder',
      canonicalName: 'TestEncoder',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'encoder',
      componentName: 'TestEncoder',
      componentMaker: 'TestMaker',
      propertyKey: 'encoder_steps',
      value: '20',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-enum',
      fieldKey: 'encoder',
      componentType: 'encoder',
      componentName: 'TestEncoder',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          encoder_steps: {
            variance_policy: 'authoritative',
            constraints: [],
            enum: { policy: 'closed', source: 'data_lists.encoder_steps' },
          },
        },
      },
      knownValues: {
        enums: {
          encoder_steps: { policy: 'closed', values: ['5', '16', '18', '20', '24'] },
        },
      },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'encoder',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestEncoder');
    assert.ok(row, 'expected TestEncoder row');
    assert.deepStrictEqual(
      row.properties.encoder_steps.enum_values,
      ['5', '16', '18', '20', '24'],
      'enum_values should come from field rules',
    );
    assert.strictEqual(row.properties.encoder_steps.enum_policy, 'closed', 'enum_policy should come from field rules');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload strips review-disabled constraints and enum metadata from field rules', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'encoder',
      canonicalName: 'TestEncoderGate',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'encoder',
      componentName: 'TestEncoderGate',
      componentMaker: 'TestMaker',
      propertyKey: 'encoder_steps',
      value: '20',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-enum-gates',
      fieldKey: 'encoder',
      componentType: 'encoder',
      componentName: 'TestEncoderGate',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          encoder_steps: {
            variance_policy: 'authoritative',
            constraints: ['encoder_steps <= 32'],
            enum: { policy: 'closed', source: 'data_lists.encoder_steps' },
            consumers: {
              constraints: { review: false },
              'enum.source': { review: false },
              'enum.policy': { review: false },
            },
          },
        },
      },
      knownValues: {
        enums: {
          encoder_steps: { policy: 'closed', values: ['5', '16', '18', '20', '24'] },
        },
      },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'encoder',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestEncoderGate');
    assert.ok(row, 'expected TestEncoderGate row');
    assert.deepStrictEqual(row.properties.encoder_steps.constraints, []);
    assert.strictEqual(row.properties.encoder_steps.enum_values, null);
    assert.strictEqual(row.properties.encoder_steps.enum_policy, null);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('override_allowed property skips variance evaluation - no violation flags despite value mismatch', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'max_dpi',
      value: '35000',
      confidence: 1,
      variancePolicy: 'override_allowed',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-override-test',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    specDb.upsertItemFieldState({
      productId: 'mouse-override-test',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const fieldRules = {
      rules: {
        fields: {
          max_dpi: {
            variance_policy: 'override_allowed',
            constraints: [],
          },
        },
      },
      knownValues: { enums: {} },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950');
    assert.ok(row, 'expected PAW3950 row');
    const prop = row.properties.max_dpi;
    assert.ok(prop, 'expected max_dpi property');
    assert.strictEqual(prop.variance_policy, 'override_allowed', 'property should carry override_allowed policy');
    assert.strictEqual(
      prop.reason_codes.includes('variance_violation'),
      false,
      'override_allowed must NOT produce variance_violation reason code',
    );
    assert.strictEqual(prop.variance_violations, undefined, 'override_allowed must NOT populate variance_violations');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('authoritative property DOES flag variance violation for same mismatch scenario', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'max_dpi',
      value: '35000',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-auth-test',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    specDb.upsertItemFieldState({
      productId: 'mouse-auth-test',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const fieldRules = {
      rules: {
        fields: {
          max_dpi: {
            variance_policy: 'authoritative',
            constraints: [],
          },
        },
      },
      knownValues: { enums: {} },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950');
    assert.ok(row, 'expected PAW3950 row');
    const prop = row.properties.max_dpi;
    assert.ok(prop, 'expected max_dpi property');
    assert.strictEqual(prop.variance_policy, 'authoritative', 'property should carry authoritative policy');
    assert.strictEqual(
      prop.reason_codes.includes('variance_violation'),
      true,
      'authoritative mismatch MUST produce variance_violation',
    );
    assert.ok(prop.variance_violations, 'authoritative mismatch MUST populate variance_violations');
    assert.strictEqual(prop.variance_violations.count, 1, 'one product has a mismatched value');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
