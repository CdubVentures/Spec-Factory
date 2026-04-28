import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runComponentInvariantChecks } from '../compileValidation.js';

function sensorRule(extra = {}) {
  return {
    key: 'sensor',
    enum: { source: 'component_db.sensor' },
    ...extra,
  };
}

function dpiPropertyRule(extra = {}) {
  return {
    key: 'dpi',
    contract: { type: 'number', unit: 'dpi' },
    ...extra,
  };
}

function mapWithSensor(extra = {}) {
  return {
    component_sources: [
      {
        component_type: 'sensor',
        sheet: 'sensors',
        roles: {
          properties: [
            { field_key: 'dpi' },
          ],
        },
      },
    ],
    ...extra,
  };
}

describe('runComponentInvariantChecks INV-1 (component_sources → field rule)', () => {
  it('reports orphan component_sources row with no matching field rule', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { dpi: dpiPropertyRule() },
      map: mapWithSensor(),
    });
    assert.ok(
      errors.some((e) => e.includes('component_sources[sensor]') && e.includes('"sensor"')),
      `expected INV-1 sensor missing error, got: ${errors.join(' | ')}`,
    );
  });

  it('reports rule with wrong enum.source (not self-lock to component_db.<type>)', () => {
    const { errors } = runComponentInvariantChecks({
      fields: {
        sensor: { key: 'sensor', enum: { source: 'data_lists.sensor' } },
      },
      map: mapWithSensor(),
    });
    assert.ok(
      errors.some((e) => e.includes('component_sources[sensor]') && e.includes('component_db.sensor')),
      `expected INV-1 wrong-source error, got: ${errors.join(' | ')}`,
    );
  });

  it('passes when sensor rule self-locks correctly', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { sensor: sensorRule(), dpi: dpiPropertyRule() },
      map: mapWithSensor(),
    });
    assert.deepEqual(errors, []);
  });
});

describe('runComponentInvariantChecks INV-2 (field rule cross-lock + orphan)', () => {
  it('reports cross-lock when ref !== fieldKey (the dpi case)', () => {
    const { errors } = runComponentInvariantChecks({
      fields: {
        sensor: sensorRule(),
        dpi: dpiPropertyRule({ enum: { source: 'component_db.sensor' } }),
      },
      map: mapWithSensor(),
    });
    assert.ok(
      errors.some((e) => e.startsWith('field dpi:') && e.includes('must self-lock')),
      `expected INV-2 cross-lock error, got: ${errors.join(' | ')}`,
    );
  });

  it('reports orphan rule (self-locked but no component_sources entry)', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { sensor: sensorRule() },
      map: { component_sources: [] },
    });
    assert.ok(
      errors.some((e) => e.startsWith('field sensor:') && e.includes('no component_sources entry')),
      `expected INV-2 orphan-rule error, got: ${errors.join(' | ')}`,
    );
  });

  it('handles flat enum_source object form', () => {
    const { errors } = runComponentInvariantChecks({
      fields: {
        sensor: sensorRule(),
        dpi: dpiPropertyRule({ enum_source: { type: 'component_db', ref: 'sensor' } }),
      },
      map: mapWithSensor(),
    });
    assert.ok(
      errors.some((e) => e.startsWith('field dpi:') && e.includes('must self-lock')),
      `expected INV-2 cross-lock error from flat enum_source, got: ${errors.join(' | ')}`,
    );
  });

  it('handles flat enum_source string form', () => {
    const { errors } = runComponentInvariantChecks({
      fields: {
        sensor: sensorRule(),
        dpi: dpiPropertyRule({ enum_source: 'component_db.sensor' }),
      },
      map: mapWithSensor(),
    });
    assert.ok(
      errors.some((e) => e.startsWith('field dpi:') && e.includes('must self-lock')),
      `expected INV-2 cross-lock error from flat enum_source string, got: ${errors.join(' | ')}`,
    );
  });

  it('does not flag data_lists or known_values sources', () => {
    const { errors } = runComponentInvariantChecks({
      fields: {
        sensor: sensorRule(),
        dpi: dpiPropertyRule(),
        lighting: { key: 'lighting', enum: { source: 'data_lists.lighting' } },
      },
      map: mapWithSensor(),
    });
    assert.deepEqual(errors, []);
  });
});

describe('runComponentInvariantChecks INV-3 (property field_key existence)', () => {
  it('reports missing property field rule', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { sensor: sensorRule() },
      map: mapWithSensor(), // declares property dpi
    });
    assert.ok(
      errors.some((e) => e.includes('property field_key "dpi"')),
      `expected INV-3 property error, got: ${errors.join(' | ')}`,
    );
  });

  it('skips component_only properties (they intentionally do not promote)', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { sensor: sensorRule() },
      map: {
        component_sources: [
          {
            component_type: 'sensor',
            sheet: 'sensors',
            roles: {
              properties: [
                { field_key: 'dpi', component_only: true },
              ],
            },
          },
        ],
      },
    });
    // dpi is component_only, so INV-3 should NOT flag it.
    assert.equal(
      errors.some((e) => e.includes('property field_key "dpi"')),
      false,
      `component_only property should not trigger INV-3, got: ${errors.join(' | ')}`,
    );
  });

  it('passes when all properties have matching field rules', () => {
    const { errors } = runComponentInvariantChecks({
      fields: { sensor: sensorRule(), dpi: dpiPropertyRule() },
      map: mapWithSensor(),
    });
    assert.deepEqual(errors, []);
  });
});

describe('runComponentInvariantChecks happy path', () => {
  it('returns no errors when rules + map are fully aligned', () => {
    const { errors, warnings } = runComponentInvariantChecks({
      fields: {
        sensor: sensorRule(),
        dpi: dpiPropertyRule(),
      },
      map: mapWithSensor(),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('handles empty inputs', () => {
    const { errors } = runComponentInvariantChecks({ fields: {}, map: {} });
    assert.deepEqual(errors, []);
  });

  it('handles undefined inputs', () => {
    const { errors } = runComponentInvariantChecks({});
    assert.deepEqual(errors, []);
  });
});
