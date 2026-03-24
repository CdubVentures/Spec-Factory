import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  loadFieldStudioMap,
  validateFieldStudioMap,
} from '../../../test/helpers/categoryCompileHarness.js';

test('FRC-05-D - compiler coerces string property variance_policy to authoritative', () => {
  const rawMap = {
    component_sources: [
      {
        type: 'sensor',
        sheet: 'sensors',
        header_row: 1,
        first_data_row: 2,
        roles: {
          primary_identifier: 'C',
          maker: 'B',
          aliases: [],
          links: ['J'],
          properties: [
            { column: 'F', field_key: 'dpi', type: 'number', variance_policy: 'upper_bound' },
            { column: 'G', field_key: 'sensor_type', type: 'string', variance_policy: 'upper_bound' },
            { column: 'I', field_key: 'sensor_date', type: 'string', variance_policy: 'range' },
            { column: 'H', field_key: 'detent_type', variance_policy: 'lower_bound' },
          ],
        },
      },
    ],
  };

  const result = validateFieldStudioMap(rawMap);

  const warnings = result.warnings || [];
  const coercionWarnings = warnings.filter((warning) => (
    warning.includes('variance_policy') && warning.includes('authoritative')
  ));
  assert.ok(
    coercionWarnings.length >= 3,
    `should have at least 3 coercion warnings for string properties, got ${coercionWarnings.length}: ${JSON.stringify(coercionWarnings)}`,
  );
  assert.ok(coercionWarnings.find((warning) => warning.includes('sensor_type')));
  assert.ok(coercionWarnings.find((warning) => warning.includes('sensor_date')));
  assert.ok(coercionWarnings.find((warning) => warning.includes('detent_type')));

  const normalizedSensor = result.normalized.component_sources[0];
  const props = normalizedSensor.roles.properties;
  const dpiProp = props.find((prop) => prop.field_key === 'dpi');
  const sensorTypeProp = props.find((prop) => prop.field_key === 'sensor_type');
  const sensorDateProp = props.find((prop) => prop.field_key === 'sensor_date');
  const detentTypeProp = props.find((prop) => prop.field_key === 'detent_type');

  assert.equal(dpiProp.variance_policy, 'upper_bound', 'numeric property should keep upper_bound');
  assert.equal(
    sensorTypeProp.variance_policy,
    'authoritative',
    'string property with upper_bound should be coerced to authoritative',
  );
  assert.equal(
    sensorDateProp.variance_policy,
    'authoritative',
    'string property with range should be coerced to authoritative',
  );
  assert.equal(
    detentTypeProp.variance_policy,
    'authoritative',
    'default string property with lower_bound should be coerced to authoritative',
  );
});

test('FRC-05-E - mouse sensor component policies remain numeric upper_bound for dpi/ips/acceleration', async (t) => {
  const loaded = await loadFieldStudioMap({
    category: 'mouse',
    config: {
      categoryAuthorityRoot: path.resolve('category_authority'),
    },
  });
  assert.ok(loaded?.map, 'mouse field studio map should load');

  const sources = Array.isArray(loaded.map.component_sources) ? loaded.map.component_sources : [];
  const sensorSource = sources.find((row) => String(row?.type || row?.component_type || '').toLowerCase() === 'sensor');
  if (!sensorSource) {
    t.skip('sensor component source not present in current field_studio_map');
    return;
  }

  const props = Array.isArray(sensorSource?.roles?.properties) ? sensorSource.roles.properties : [];
  const findProp = (key) => props.find((prop) => (prop?.field_key || prop?.key) === key);
  const requiredPolicies = [
    { key: 'dpi', unit: 'dpi' },
    { key: 'ips', unit: 'ips' },
    { key: 'acceleration', unit: 'g' },
  ];

  for (const requirement of requiredPolicies) {
    const prop = findProp(requirement.key);
    assert.ok(prop, `sensor property '${requirement.key}' should exist in field studio map`);
    assert.equal(prop.type, 'number', `${requirement.key} should stay typed as number`);
    assert.equal(prop.unit, requirement.unit, `${requirement.key} unit should stay '${requirement.unit}'`);
    assert.equal(
      prop.variance_policy,
      'upper_bound',
      `${requirement.key} variance policy should stay upper_bound`,
    );
  }

  const validated = validateFieldStudioMap(loaded.map);
  const driftWarnings = (validated.warnings || []).filter((warning) => (
    warning.includes("coerced to 'authoritative'")
    && (warning.includes('dpi') || warning.includes('ips') || warning.includes('acceleration'))
  ));
  assert.equal(
    driftWarnings.length,
    0,
    `mouse sensor numeric properties should not be coerced to authoritative: ${JSON.stringify(driftWarnings)}`,
  );
});
