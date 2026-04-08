import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../../db/specDb.js';
import { validateField } from '../validation/validateField.js';
import { mergeDiscoveredEnums } from '../validation/mergeDiscoveredEnums.js';
import { buildDiscoveredEnumMap } from '../buildDiscoveredEnumMap.js';
import { persistDiscoveredValue } from '../persistDiscoveredValues.js';
import { buildStudioKnownValuesFromSpecDb } from '../../studio/api/studioRouteHelpers.js';

// --- Factories ---
function makeFieldRule(policy = 'open_prefer_known', extra = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', unknown_token: 'unk' },
    parse: { template: 'text_field' },
    enum: { policy, match: { strategy: 'alias' } },
    ...extra,
  };
}

// --- JSON accumulator (simulates the caller-level JSON writer) ---
function createJsonAccumulator() {
  const doc = { category: 'mouse', version: 1, values: {} };
  return {
    doc,
    onValueDiscovered({ fieldKey, value, firstSeenAt }) {
      if (!doc.values[fieldKey]) doc.values[fieldKey] = [];
      doc.values[fieldKey].push({ value, first_seen_at: firstSeenAt });
      doc.updated_at = new Date().toISOString();
    },
  };
}

describe('Discovery Enum E2E — Scenario A: full lifecycle', () => {
  let specDb;
  const jsonAcc = createJsonAccumulator();

  before(() => { specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' }); });
  after(() => { specDb?.close?.(); });

  it('1. ensureEnumList creates the row for an orphaned field', () => {
    specDb.ensureEnumList('sensor_brand', 'auto_discovery');
    const fields = specDb.getAllEnumFields();
    assert.ok(fields.includes('sensor_brand'), 'sensor_brand should be in enum fields');
  });

  it('2. persistDiscoveredValue writes to DB + fires callback', () => {
    persistDiscoveredValue({
      specDb,
      fieldKey: 'sensor_brand',
      value: 'pixart',
      fieldRule: makeFieldRule(),
      onValueDiscovered: jsonAcc.onValueDiscovered,
    });

    const rows = specDb.getListValues('sensor_brand');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value, 'pixart');
    assert.equal(rows[0].source, 'pipeline');
    assert.equal(rows[0].needs_review, true);
  });

  it('3. JSON accumulator has the value (dual-write proof)', () => {
    assert.ok(jsonAcc.doc.values.sensor_brand);
    assert.equal(jsonAcc.doc.values.sensor_brand.length, 1);
    assert.equal(jsonAcc.doc.values.sensor_brand[0].value, 'pixart');
    assert.ok(jsonAcc.doc.values.sensor_brand[0].first_seen_at);
  });

  it('4. buildDiscoveredEnumMap reads back the discovered value', () => {
    const map = buildDiscoveredEnumMap(specDb);
    assert.deepStrictEqual(map.sensor_brand, ['pixart']);
  });

  it('5. mergeDiscoveredEnums creates entry with correct policy', () => {
    const discovered = buildDiscoveredEnumMap(specDb);
    const fieldRules = { sensor_brand: makeFieldRule() };
    const merged = mergeDiscoveredEnums({}, discovered, fieldRules);

    assert.ok(merged.enums.sensor_brand);
    assert.equal(merged.enums.sensor_brand.policy, 'open_prefer_known');
    assert.deepStrictEqual(merged.enums.sensor_brand.values, ['pixart']);
  });

  it('6. validateField uses merged values — known value passes', () => {
    const discovered = buildDiscoveredEnumMap(specDb);
    const merged = mergeDiscoveredEnums({}, discovered, { sensor_brand: makeFieldRule() });

    const result = validateField({
      fieldKey: 'sensor_brand',
      value: 'pixart',
      fieldRule: makeFieldRule(),
      knownValues: merged.enums.sensor_brand,
    });
    assert.equal(result.valid, true);
  });

  it('7. buildStudioKnownValuesFromSpecDb shows discovered values (frontend proof)', () => {
    const payload = buildStudioKnownValuesFromSpecDb(specDb, 'mouse');
    assert.ok(payload);
    assert.ok(payload.fields.sensor_brand);
    assert.ok(payload.fields.sensor_brand.includes('pixart'));
  });
});

describe('Discovery Enum E2E — Scenario B: rebuild contract', () => {
  it('JSON → fresh DB → values reconstructed', () => {
    // Simulate: we have a JSON record from a previous session
    const savedJson = {
      values: {
        sensor_brand: [{ value: 'pixart', first_seen_at: '2026-04-07T00:00:00Z' }],
        grip: [{ value: 'claw', first_seen_at: '2026-04-07T00:00:00Z' }],
      },
    };

    // Create a FRESH DB (simulates DB deletion + rebuild)
    const freshDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    try {
      // Rebuild from JSON — same logic seed.js would use
      for (const [fieldKey, entries] of Object.entries(savedJson.values)) {
        freshDb.ensureEnumList(fieldKey, 'auto_discovery');
        for (const entry of entries) {
          freshDb.upsertListValue({
            fieldKey,
            value: entry.value,
            normalizedValue: entry.value.toLowerCase().trim(),
            source: 'pipeline',
            enumPolicy: 'open_prefer_known',
            needsReview: true,
            sourceTimestamp: entry.first_seen_at,
          });
        }
      }

      // Verify rebuilt state
      const sensorRows = freshDb.getListValues('sensor_brand');
      assert.equal(sensorRows.length, 1);
      assert.equal(sensorRows[0].value, 'pixart');
      assert.equal(sensorRows[0].source, 'pipeline');

      const gripRows = freshDb.getListValues('grip');
      assert.equal(gripRows.length, 1);
      assert.equal(gripRows[0].value, 'claw');

      // Studio helper sees them
      const payload = buildStudioKnownValuesFromSpecDb(freshDb, 'mouse');
      assert.ok(payload.fields.sensor_brand.includes('pixart'));
      assert.ok(payload.fields.grip.includes('claw'));
    } finally {
      freshDb.close();
    }
  });
});

describe('Discovery Enum E2E — Scenario C: curated + discovered merged', () => {
  let specDb;
  before(() => { specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' }); });
  after(() => { specDb?.close?.(); });

  it('existing curated list gets discovered values appended', () => {
    // Seed curated values for lighting
    specDb.ensureEnumList('lighting', 'known_values');
    specDb.upsertListValue({ fieldKey: 'lighting', value: 'none', normalizedValue: 'none', source: 'known_values', enumPolicy: 'open_prefer_known' });
    specDb.upsertListValue({ fieldKey: 'lighting', value: '1 zone (rgb)', normalizedValue: '1 zone (rgb)', source: 'known_values', enumPolicy: 'open_prefer_known' });

    // Persist a discovered value
    persistDiscoveredValue({ specDb, fieldKey: 'lighting', value: '10 zone (rgb)', fieldRule: makeFieldRule() });

    // buildDiscoveredEnumMap returns only the pipeline value
    const discovered = buildDiscoveredEnumMap(specDb);
    assert.deepStrictEqual(discovered.lighting, ['10 zone (rgb)']);

    // mergeDiscoveredEnums combines curated + discovered
    const compiled = { enums: { lighting: { policy: 'open_prefer_known', values: ['none', '1 zone (rgb)'] } } };
    const fieldRules = { lighting: makeFieldRule() };
    const merged = mergeDiscoveredEnums(compiled, discovered, fieldRules);
    assert.deepStrictEqual(merged.enums.lighting.values, ['none', '1 zone (rgb)', '10 zone (rgb)']);

    // Studio helper shows all 3
    const payload = buildStudioKnownValuesFromSpecDb(specDb, 'mouse');
    assert.ok(payload.fields.lighting.includes('none'));
    assert.ok(payload.fields.lighting.includes('1 zone (rgb)'));
    assert.ok(payload.fields.lighting.includes('10 zone (rgb)'));
  });
});

describe('Discovery Enum E2E — Scenario D: O(1) multiple fields', () => {
  let specDb;
  before(() => { specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' }); });
  after(() => { specDb?.close?.(); });

  it('3 fields × 2 values each — zero per-field code', () => {
    const fieldsAndValues = {
      sensor_brand: ['pixart', 'razer'],
      grip: ['claw', 'palm'],
      design: ['standard', 'lightweight'],
    };

    // Persist all — same function, different data
    for (const [fieldKey, values] of Object.entries(fieldsAndValues)) {
      specDb.ensureEnumList(fieldKey, 'auto_discovery');
      for (const value of values) {
        persistDiscoveredValue({ specDb, fieldKey, value, fieldRule: makeFieldRule() });
      }
    }

    // buildDiscoveredEnumMap returns all 3
    const discovered = buildDiscoveredEnumMap(specDb);
    assert.deepStrictEqual(discovered.sensor_brand.sort(), ['pixart', 'razer']);
    assert.deepStrictEqual(discovered.grip.sort(), ['claw', 'palm']);
    assert.deepStrictEqual(discovered.design.sort(), ['lightweight', 'standard']);

    // Studio helper shows all 3
    const payload = buildStudioKnownValuesFromSpecDb(specDb, 'mouse');
    assert.equal(Object.keys(payload.fields).length, 3);
    assert.ok(payload.fields.sensor_brand.includes('pixart'));
    assert.ok(payload.fields.grip.includes('palm'));
    assert.ok(payload.fields.design.includes('lightweight'));
  });
});

describe('Discovery Enum E2E — Scenario E: dedup', () => {
  let specDb;
  before(() => { specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' }); });
  after(() => { specDb?.close?.(); });

  it('persisting same value twice does not duplicate', () => {
    specDb.ensureEnumList('sensor_brand', 'auto_discovery');
    persistDiscoveredValue({ specDb, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: makeFieldRule() });
    persistDiscoveredValue({ specDb, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: makeFieldRule() });

    const rows = specDb.getListValues('sensor_brand');
    assert.equal(rows.length, 1, 'should have exactly 1 row, not 2');
  });
});
