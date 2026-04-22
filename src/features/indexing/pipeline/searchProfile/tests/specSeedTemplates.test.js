// WHY: Contract tests for per-category spec seed templates in buildTier1Queries.
// When specSeeds is provided, it replaces the hardcoded "{product} specifications" query.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier1Queries } from '../queryBuilder.js';

function makeJob(overrides = {}) {
  return {
    productId: 'test-prod',
    brand: 'Corsair',
    base_model: 'K95 Platinum',
    model: 'K95 Platinum',
    category: 'keyboard',
    identityLock: { brand: 'Corsair', base_model: 'K95 Platinum', model: 'K95 Platinum', variant: '' },
    ...overrides,
  };
}

function makeSeedStatus() {
  return {
    specs_seed: { is_needed: true },
    brand_seed: { is_needed: true, brand_name: 'Corsair' },
    source_seeds: {},
  };
}

describe('buildTier1Queries spec seed templates', () => {
  it('null specSeeds falls back to single "{product} specifications" query', () => {
    // {product} includes the category search context "gaming keyboard" to
    // disambiguate brand-word collisions (e.g. Glorious, Razer, Apex).
    const rows = buildTier1Queries(makeJob(), makeSeedStatus(), null, { specSeeds: null });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows.length, 1);
    assert.equal(specRows[0].query, 'Corsair K95 Platinum gaming keyboard specifications');
  });

  it('empty array specSeeds falls back to default', () => {
    const rows = buildTier1Queries(makeJob(), makeSeedStatus(), null, { specSeeds: [] });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows.length, 1);
    assert.equal(specRows[0].query, 'Corsair K95 Platinum gaming keyboard specifications');
  });

  it('custom specSeeds produce one row per template', () => {
    const specSeeds = [
      '{product} specifications',
      '{product} datasheet pdf',
      'keyboard {brand} {model} spec sheet',
    ];
    const rows = buildTier1Queries(makeJob(), makeSeedStatus(), null, { specSeeds });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows.length, 3);
    assert.equal(specRows[0].query, 'Corsair K95 Platinum gaming keyboard specifications');
    assert.equal(specRows[1].query, 'Corsair K95 Platinum gaming keyboard datasheet pdf');
    assert.equal(specRows[2].query, 'keyboard Corsair K95 Platinum spec sheet');
  });

  it('{product} variable resolves to brand + model + variant + category_context', () => {
    const job = makeJob({ variant: 'XT' });
    job.identityLock.variant = 'XT';
    const rows = buildTier1Queries(job, makeSeedStatus(), null, {
      specSeeds: ['{product} specs'],
    });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows[0].query, 'Corsair K95 Platinum XT gaming keyboard specs');
  });

  it('{category} variable resolves correctly', () => {
    const rows = buildTier1Queries(makeJob(), makeSeedStatus(), null, {
      specSeeds: ['{category} {brand} {model} review'],
    });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows[0].query, 'keyboard Corsair K95 Platinum review');
  });

  it('spec seeds skipped when specs_seed.is_needed is false', () => {
    const seedStatus = { ...makeSeedStatus(), specs_seed: { is_needed: false } };
    const rows = buildTier1Queries(makeJob(), seedStatus, null, {
      specSeeds: ['{product} specifications', '{product} datasheet'],
    });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    assert.equal(specRows.length, 0, 'no spec rows when is_needed is false');
  });

  it('all spec seed rows have tier: seed and hint_source: tier1_seed', () => {
    const rows = buildTier1Queries(makeJob(), makeSeedStatus(), null, {
      specSeeds: ['{product} specs', '{product} datasheet'],
    });
    const specRows = rows.filter(r => r.doc_hint === 'spec');
    for (const row of specRows) {
      assert.equal(row.tier, 'seed');
      assert.equal(row.hint_source, 'tier1_seed');
    }
  });
});
