import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUnit, getRegistryUnits, invalidateUnitRegistryCache } from '../unitRegistry.js';

// WHY: Fake appDb for testing — returns hardcoded unit entries.
function createFakeAppDb(units) {
  return {
    listUnits() {
      return units.map(u => ({
        canonical: u.canonical,
        label: u.label || '',
        synonyms: u.synonyms || [],
        conversions: u.conversions || [],
      }));
    },
  };
}

const TEST_UNITS = [
  { canonical: 'g', synonyms: ['gram', 'grams', 'gr'], conversions: [{ from: 'kg', factor: 1000 }, { from: 'lb', factor: 453.592 }, { from: 'oz', factor: 28.3495 }] },
  { canonical: 'Hz', synonyms: ['hz', 'hertz'], conversions: [{ from: 'kHz', factor: 1000 }] },
  { canonical: 'mm', synonyms: ['millimeter', 'millimeters'], conversions: [{ from: 'in', factor: 25.4 }, { from: 'cm', factor: 10 }] },
  { canonical: 'W', synonyms: ['w', 'watt', 'watts'], conversions: [{ from: 'kW', factor: 1000 }] },
  { canonical: '%', synonyms: ['percent', 'pct'], conversions: [] },
  { canonical: 'ms', synonyms: ['millisecond', 'milliseconds'], conversions: [] },
];

describe('resolveUnit — canonical match', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('exact canonical match', () => {
    const r = resolveUnit('g', 'g', appDb);
    assert.deepStrictEqual(r, { canonical: 'g', factor: 1 });
  });

  it('case-insensitive canonical match', () => {
    const r = resolveUnit('hz', 'Hz', appDb);
    assert.deepStrictEqual(r, { canonical: 'Hz', factor: 1 });
  });

  it('case-insensitive W', () => {
    const r = resolveUnit('w', 'W', appDb);
    assert.deepStrictEqual(r, { canonical: 'W', factor: 1 });
  });
});

describe('resolveUnit — synonym resolution', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('hertz → Hz', () => {
    const r = resolveUnit('hertz', 'Hz', appDb);
    assert.deepStrictEqual(r, { canonical: 'Hz', factor: 1 });
  });

  it('grams → g', () => {
    const r = resolveUnit('grams', 'g', appDb);
    assert.deepStrictEqual(r, { canonical: 'g', factor: 1 });
  });

  it('percent → %', () => {
    const r = resolveUnit('percent', '%', appDb);
    assert.deepStrictEqual(r, { canonical: '%', factor: 1 });
  });

  it('milliseconds → ms', () => {
    const r = resolveUnit('milliseconds', 'ms', appDb);
    assert.deepStrictEqual(r, { canonical: 'ms', factor: 1 });
  });

  it('watt → W', () => {
    const r = resolveUnit('watt', 'W', appDb);
    assert.deepStrictEqual(r, { canonical: 'W', factor: 1 });
  });
});

describe('resolveUnit — conversion', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('lb → g via factor 453.592', () => {
    const r = resolveUnit('lb', 'g', appDb);
    assert.equal(r.canonical, 'g');
    assert.equal(r.factor, 453.592);
  });

  it('oz → g via factor 28.3495', () => {
    const r = resolveUnit('oz', 'g', appDb);
    assert.equal(r.canonical, 'g');
    assert.equal(r.factor, 28.3495);
  });

  it('kg → g via factor 1000', () => {
    const r = resolveUnit('kg', 'g', appDb);
    assert.equal(r.canonical, 'g');
    assert.equal(r.factor, 1000);
  });

  it('kHz → Hz via factor 1000', () => {
    const r = resolveUnit('kHz', 'Hz', appDb);
    assert.equal(r.canonical, 'Hz');
    assert.equal(r.factor, 1000);
  });

  it('in → mm via factor 25.4', () => {
    const r = resolveUnit('in', 'mm', appDb);
    assert.equal(r.canonical, 'mm');
    assert.equal(r.factor, 25.4);
  });
});

describe('resolveUnit — unknown', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('unknown unit returns null', () => {
    assert.equal(resolveUnit('foobar', 'g', appDb), null);
  });

  it('null detected returns null', () => {
    assert.equal(resolveUnit(null, 'g', appDb), null);
  });

  it('empty detected returns null', () => {
    assert.equal(resolveUnit('', 'g', appDb), null);
  });

  it('null expected returns null', () => {
    assert.equal(resolveUnit('g', null, appDb), null);
  });
});

describe('resolveUnit — unregistered custom unit', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('case-insensitive match works for units not in registry', () => {
    const r = resolveUnit('foobar', 'foobar', appDb);
    assert.deepStrictEqual(r, { canonical: 'foobar', factor: 1 });
  });

  it('case-insensitive custom unit', () => {
    const r = resolveUnit('FOOBAR', 'foobar', appDb);
    assert.deepStrictEqual(r, { canonical: 'foobar', factor: 1 });
  });
});

describe('resolveUnit — no appDb fallback', () => {
  beforeEach(() => invalidateUnitRegistryCache());

  it('exact match works without appDb', () => {
    const r = resolveUnit('g', 'g');
    assert.deepStrictEqual(r, { canonical: 'g', factor: 1 });
  });

  it('case-insensitive match works without appDb', () => {
    const r = resolveUnit('HZ', 'Hz');
    assert.deepStrictEqual(r, { canonical: 'Hz', factor: 1 });
  });

  it('synonym fails without appDb (no registry)', () => {
    assert.equal(resolveUnit('hertz', 'Hz'), null);
  });
});

describe('getRegistryUnits', () => {
  beforeEach(() => invalidateUnitRegistryCache());
  const appDb = createFakeAppDb(TEST_UNITS);

  it('returns all canonical units', () => {
    const units = getRegistryUnits(appDb);
    assert.ok(units.includes('g'));
    assert.ok(units.includes('Hz'));
    assert.ok(units.includes('mm'));
    assert.ok(units.includes('W'));
    assert.ok(units.includes('%'));
    assert.ok(units.includes('ms'));
    assert.equal(units.length, TEST_UNITS.length);
  });

  it('returns empty without appDb', () => {
    assert.deepStrictEqual(getRegistryUnits(null), []);
  });
});
