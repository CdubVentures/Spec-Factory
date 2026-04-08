import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveredEnumMap } from '../buildDiscoveredEnumMap.js';

// --- Mock specDb factory ---
function mockSpecDb({ enumFields = [], listValuesByField = {} } = {}) {
  return {
    getAllEnumFields() { return enumFields; },
    getListValues(fieldKey) { return listValuesByField[fieldKey] || []; },
  };
}

describe('buildDiscoveredEnumMap — empty DB', () => {
  it('returns empty map when no enum fields exist', () => {
    const db = mockSpecDb();
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result, {});
  });

  it('returns empty map when enum fields exist but have no list values', () => {
    const db = mockSpecDb({ enumFields: ['sensor_brand', 'grip'] });
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result, {});
  });
});

describe('buildDiscoveredEnumMap — pipeline values', () => {
  it('returns discovered values for fields with pipeline source', () => {
    const db = mockSpecDb({
      enumFields: ['sensor_brand'],
      listValuesByField: {
        sensor_brand: [
          { value: 'pixart', source: 'pipeline', overridden: false },
          { value: 'razer', source: 'pipeline', overridden: false },
        ],
      },
    });
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result, { sensor_brand: ['pixart', 'razer'] });
  });

  it('filters out non-pipeline sources', () => {
    const db = mockSpecDb({
      enumFields: ['lighting'],
      listValuesByField: {
        lighting: [
          { value: 'none', source: 'known_values', overridden: false },
          { value: '1 zone (rgb)', source: 'known_values', overridden: false },
          { value: '10 zone (rgb)', source: 'pipeline', overridden: false },
        ],
      },
    });
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result, { lighting: ['10 zone (rgb)'] });
  });

  it('filters out overridden values', () => {
    const db = mockSpecDb({
      enumFields: ['sensor_brand'],
      listValuesByField: {
        sensor_brand: [
          { value: 'pixart', source: 'pipeline', overridden: false },
          { value: 'old-brand', source: 'pipeline', overridden: true },
        ],
      },
    });
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result, { sensor_brand: ['pixart'] });
  });

  it('handles multiple fields', () => {
    const db = mockSpecDb({
      enumFields: ['sensor_brand', 'grip', 'design'],
      listValuesByField: {
        sensor_brand: [{ value: 'pixart', source: 'pipeline', overridden: false }],
        grip: [
          { value: 'claw', source: 'pipeline', overridden: false },
          { value: 'palm', source: 'pipeline', overridden: false },
        ],
        design: [],
      },
    });
    const result = buildDiscoveredEnumMap(db);
    assert.deepStrictEqual(result.sensor_brand, ['pixart']);
    assert.deepStrictEqual(result.grip, ['claw', 'palm']);
    assert.equal(result.design, undefined);
  });
});

describe('buildDiscoveredEnumMap — edge cases', () => {
  it('skips fields where all pipeline values are overridden', () => {
    const db = mockSpecDb({
      enumFields: ['sensor_brand'],
      listValuesByField: {
        sensor_brand: [
          { value: 'typo-brand', source: 'pipeline', overridden: true },
        ],
      },
    });
    const result = buildDiscoveredEnumMap(db);
    assert.equal(result.sensor_brand, undefined);
  });

  it('handles null specDb gracefully', () => {
    const result = buildDiscoveredEnumMap(null);
    assert.deepStrictEqual(result, {});
  });
});
