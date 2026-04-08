import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDiscoveredEnums } from '../mergeDiscoveredEnums.js';

// --- Factories ---
function makeCompiled(enums = {}) {
  return { category: 'mouse', enums };
}

function makeFieldRules(overrides = {}) {
  return {
    sensor_brand: { enum: { policy: 'open_prefer_known' } },
    grip: { enum: { policy: 'open_prefer_known' } },
    lighting: { enum: { policy: 'open_prefer_known' } },
    colors: { enum: { policy: 'closed' } },
    ...overrides,
  };
}

describe('mergeDiscoveredEnums — no discovered values', () => {
  it('returns compiled unchanged when discoveredByField is empty', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none', '1 zone (rgb)'] },
    });
    const result = mergeDiscoveredEnums(compiled, {}, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting, compiled.enums.lighting);
  });

  it('returns compiled unchanged when discoveredByField is null', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none'] },
    });
    const result = mergeDiscoveredEnums(compiled, null, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting, compiled.enums.lighting);
  });

  it('preserves all compiled entries', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none'] },
      colors: { policy: 'closed', values: ['black', 'white'] },
    });
    const result = mergeDiscoveredEnums(compiled, {}, makeFieldRules());
    assert.deepStrictEqual(Object.keys(result.enums).sort(), ['colors', 'lighting']);
  });
});

describe('mergeDiscoveredEnums — discovered only (no compiled entry)', () => {
  it('creates new entry from discovered values with policy from fieldRules', () => {
    const compiled = makeCompiled({});
    const discovered = { sensor_brand: ['pixart', 'razer'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.ok(result.enums.sensor_brand);
    assert.equal(result.enums.sensor_brand.policy, 'open_prefer_known');
    assert.deepStrictEqual(result.enums.sensor_brand.values, ['pixart', 'razer']);
  });

  it('defaults to open_prefer_known when fieldRule has no enum policy', () => {
    const compiled = makeCompiled({});
    const discovered = { unknown_field: ['val1'] };
    const result = mergeDiscoveredEnums(compiled, discovered, {});
    assert.equal(result.enums.unknown_field.policy, 'open_prefer_known');
    assert.deepStrictEqual(result.enums.unknown_field.values, ['val1']);
  });

  it('creates multiple new entries', () => {
    const compiled = makeCompiled({});
    const discovered = { sensor_brand: ['pixart'], grip: ['claw', 'palm'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.ok(result.enums.sensor_brand);
    assert.ok(result.enums.grip);
    assert.deepStrictEqual(result.enums.grip.values, ['claw', 'palm']);
  });
});

describe('mergeDiscoveredEnums — both compiled and discovered', () => {
  it('appends discovered values to existing compiled list', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none', '1 zone (rgb)'] },
    });
    const discovered = { lighting: ['10 zone (rgb)'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting.values, ['none', '1 zone (rgb)', '10 zone (rgb)']);
  });

  it('deduplicates exact matches', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none', '1 zone (rgb)'] },
    });
    const discovered = { lighting: ['none', '2 zone (rgb)'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting.values, ['none', '1 zone (rgb)', '2 zone (rgb)']);
  });

  it('deduplicates case-insensitive matches', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none', 'PTFE'] },
    });
    const discovered = { lighting: ['ptfe', 'None', 'glass'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting.values, ['none', 'PTFE', 'glass']);
  });

  it('preserves compiled policy even when discovered values appended', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none'] },
    });
    const discovered = { lighting: ['10 zone (rgb)'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.equal(result.enums.lighting.policy, 'open_prefer_known');
  });

  it('mixes existing and new field entries', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none'] },
    });
    const discovered = { lighting: ['2 zone (rgb)'], sensor_brand: ['pixart'] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.deepStrictEqual(result.enums.lighting.values, ['none', '2 zone (rgb)']);
    assert.deepStrictEqual(result.enums.sensor_brand.values, ['pixart']);
  });
});

describe('mergeDiscoveredEnums — edge cases', () => {
  it('null compiledKnownValues → builds from discovered only', () => {
    const discovered = { sensor_brand: ['pixart'] };
    const result = mergeDiscoveredEnums(null, discovered, makeFieldRules());
    assert.ok(result.enums.sensor_brand);
    assert.deepStrictEqual(result.enums.sensor_brand.values, ['pixart']);
  });

  it('undefined compiledKnownValues → builds from discovered only', () => {
    const discovered = { sensor_brand: ['pixart'] };
    const result = mergeDiscoveredEnums(undefined, discovered, makeFieldRules());
    assert.ok(result.enums.sensor_brand);
  });

  it('both null → returns empty enums', () => {
    const result = mergeDiscoveredEnums(null, null, {});
    assert.deepStrictEqual(result.enums, {});
  });

  it('discovered field with empty array → no entry created', () => {
    const compiled = makeCompiled({});
    const discovered = { sensor_brand: [] };
    const result = mergeDiscoveredEnums(compiled, discovered, makeFieldRules());
    assert.equal(result.enums.sensor_brand, undefined);
  });

  it('does not mutate original compiled object', () => {
    const compiled = makeCompiled({
      lighting: { policy: 'open_prefer_known', values: ['none'] },
    });
    const originalValues = [...compiled.enums.lighting.values];
    mergeDiscoveredEnums(compiled, { lighting: ['2 zone (rgb)'] }, makeFieldRules());
    assert.deepStrictEqual(compiled.enums.lighting.values, originalValues);
  });

  it('preserves non-enum properties on compiled object', () => {
    const compiled = { category: 'mouse', version: 1, enums: {} };
    const result = mergeDiscoveredEnums(compiled, { sensor_brand: ['pixart'] }, makeFieldRules());
    assert.equal(result.category, 'mouse');
    assert.equal(result.version, 1);
  });
});
