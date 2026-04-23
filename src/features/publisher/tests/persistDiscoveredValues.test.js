import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { persistDiscoveredValue } from '../persistDiscoveredValues.js';

// --- Mock specDb factory ---
function mockSpecDb() {
  const calls = { upsertListValue: [], getListValueByFieldAndValue: [] };
  const existingValues = new Map();
  return {
    calls,
    existingValues,
    getListValueByFieldAndValue(fieldKey, value) {
      calls.getListValueByFieldAndValue.push({ fieldKey, value });
      return existingValues.get(`${fieldKey}::${value}`) || null;
    },
    upsertListValue(opts) {
      calls.upsertListValue.push(opts);
    },
  };
}

function makeRule(policy = 'open_prefer_known', extra = {}) {
  return { enum: { policy }, ...extra };
}

describe('persistDiscoveredValue — skips', () => {
  it('skips when field policy is not open_prefer_known', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'colors', value: 'pink', fieldRule: makeRule('closed') });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when field policy is open', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sku', value: 'ABC', fieldRule: makeRule('open') });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when value is null', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: null, fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when value is empty string', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: '', fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when value is null', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: null, fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when value already exists in DB', () => {
    const db = mockSpecDb();
    db.existingValues.set('sensor_brand::pixart', { id: 1, value: 'pixart' });
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips when fieldRule is null', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: null });
    assert.equal(db.calls.upsertListValue.length, 0);
  });

  it('skips boolean fields even if stale policy says open_prefer_known', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({
      specDb: db,
      fieldKey: 'discontinued',
      value: 'no',
      fieldRule: makeRule('open_prefer_known', { contract: { type: 'boolean', shape: 'scalar' } }),
    });
    assert.equal(db.calls.upsertListValue.length, 0);
  });
});

describe('persistDiscoveredValue — inserts', () => {
  it('inserts new value with source=pipeline and needsReview=true', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 1);
    const call = db.calls.upsertListValue[0];
    assert.equal(call.fieldKey, 'sensor_brand');
    assert.equal(call.value, 'pixart');
    assert.equal(call.source, 'pipeline');
    assert.equal(call.needsReview, true);
    assert.equal(call.enumPolicy, 'open_prefer_known');
  });

  it('normalizes value to lowercase for normalizedValue', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: 'PixArt', fieldRule: makeRule() });
    const call = db.calls.upsertListValue[0];
    assert.equal(call.value, 'PixArt');
    assert.equal(call.normalizedValue, 'pixart');
  });

  it('trims whitespace from normalizedValue', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: '  razer  ', fieldRule: makeRule() });
    const call = db.calls.upsertListValue[0];
    assert.equal(call.value, '  razer  ');
    assert.equal(call.normalizedValue, 'razer');
  });
});

describe('persistDiscoveredValue — onValueDiscovered callback', () => {
  it('calls onValueDiscovered with correct args when provided', () => {
    const db = mockSpecDb();
    const captured = [];
    persistDiscoveredValue({
      specDb: db,
      fieldKey: 'sensor_brand',
      value: 'pixart',
      fieldRule: makeRule(),
      onValueDiscovered: (entry) => captured.push(entry),
    });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].fieldKey, 'sensor_brand');
    assert.equal(captured[0].value, 'pixart');
    assert.ok(captured[0].firstSeenAt);
  });

  it('works without onValueDiscovered (backward compat)', () => {
    const db = mockSpecDb();
    persistDiscoveredValue({ specDb: db, fieldKey: 'sensor_brand', value: 'pixart', fieldRule: makeRule() });
    assert.equal(db.calls.upsertListValue.length, 1);
  });

  it('does not call onValueDiscovered when value is skipped', () => {
    const db = mockSpecDb();
    const captured = [];
    persistDiscoveredValue({
      specDb: db,
      fieldKey: 'sensor_brand',
      value: null,
      fieldRule: makeRule(),
      onValueDiscovered: (entry) => captured.push(entry),
    });
    assert.equal(captured.length, 0);
  });

  it('does not call onValueDiscovered when value already exists', () => {
    const db = mockSpecDb();
    db.existingValues.set('sensor_brand::pixart', { id: 1, value: 'pixart' });
    const captured = [];
    persistDiscoveredValue({
      specDb: db,
      fieldKey: 'sensor_brand',
      value: 'pixart',
      fieldRule: makeRule(),
      onValueDiscovered: (entry) => captured.push(entry),
    });
    assert.equal(captured.length, 0);
  });
});
