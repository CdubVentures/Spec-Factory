import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldHistories } from '../src/indexlab/buildFieldHistories.js';
import { buildRunSummaryIdentityDiscoverySection } from '../src/features/indexing/orchestration/finalize/buildRunSummaryIdentityDiscoverySection.js';

// WHY: This integration test proves the field history feedback loop works end-to-end.
// The loop: discovery queries → summary.searchPlanQueries → buildFieldHistories →
// previousFieldHistories → next NeedSet → LLM planner sees existing_queries and diversifies.

describe('field history feedback loop — round-over-round accumulation', () => {
  const makeDiscoveryResult = (queries = []) => ({
    enabled: true,
    discoveryKey: 'dk',
    candidatesKey: 'ck',
    candidates: [],
    search_attempts: [],
    queries,
  });

  const makeProvenance = (entries = {}) => entries;

  it('round 0 → round 1: queries accumulate in existing_queries', () => {
    // Round 0: discovery generates 2 queries targeting sensor_brand
    const round0Discovery = makeDiscoveryResult([
      { query: 'logitech g pro sensor specs', source: 'llm', target_fields: ['sensor_brand', 'dpi_max'] },
      { query: 'logitech g pro x superlight weight', source: 'targeted', target_fields: ['weight'] },
    ]);

    // Summary extracts searchPlanQueries (the wiring fix)
    const round0Summary = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: round0Discovery,
    });

    // Provenance from round 0: found sensor_brand but not dpi_max or weight
    const round0Provenance = makeProvenance({
      sensor_brand: {
        value: 'HERO 2',
        evidence: [{ url: 'https://logitech.com/g-pro', rootDomain: 'logitech.com', tier: 1, tierName: 'manufacturer' }],
      },
      dpi_max: { value: 'unk', evidence: [] },
      weight: { value: 'unk', evidence: [] },
    });

    // buildFieldHistories merges round 0 artifacts
    const round0Histories = buildFieldHistories({
      previousFieldHistories: {},
      provenance: round0Provenance,
      searchPlanQueries: round0Summary.searchPlanQueries,
      duplicatesSuppressed: 0,
    });

    // VERIFY: sensor_brand has the query in existing_queries
    assert.ok(round0Histories.sensor_brand, 'sensor_brand history must exist');
    assert.deepStrictEqual(
      round0Histories.sensor_brand.existing_queries,
      ['logitech g pro sensor specs'],
    );
    assert.equal(round0Histories.sensor_brand.query_count, 1);
    assert.deepStrictEqual(round0Histories.sensor_brand.domains_tried, ['logitech.com']);
    assert.equal(round0Histories.sensor_brand.no_value_attempts, 0); // found value

    // VERIFY: dpi_max was targeted but got no value
    assert.ok(round0Histories.dpi_max, 'dpi_max history must exist');
    assert.deepStrictEqual(round0Histories.dpi_max.existing_queries, ['logitech g pro sensor specs']);
    assert.equal(round0Histories.dpi_max.no_value_attempts, 1); // targeted but no value

    // VERIFY: weight was targeted but got no value
    assert.ok(round0Histories.weight, 'weight history must exist');
    assert.deepStrictEqual(round0Histories.weight.existing_queries, ['logitech g pro x superlight weight']);
    assert.equal(round0Histories.weight.no_value_attempts, 1);

    // ---- Round 1: new queries, different strategy ----
    const round1Discovery = makeDiscoveryResult([
      { query: 'logitech g pro x superlight 2 dpi review', source: 'llm', target_fields: ['dpi_max'] },
      { query: 'logitech gpx2 weight rtings', source: 'llm', target_fields: ['weight'] },
    ]);

    const round1Summary = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: round1Discovery,
    });

    const round1Provenance = makeProvenance({
      dpi_max: {
        value: '32000',
        evidence: [{ url: 'https://rtings.com/mouse/review', rootDomain: 'rtings.com', tier: 2, tierName: 'review' }],
      },
      weight: { value: 'unk', evidence: [] },
    });

    const round1Histories = buildFieldHistories({
      previousFieldHistories: round0Histories,
      provenance: round1Provenance,
      searchPlanQueries: round1Summary.searchPlanQueries,
      duplicatesSuppressed: 1,
    });

    // VERIFY: dpi_max accumulated queries across rounds
    assert.deepStrictEqual(
      round1Histories.dpi_max.existing_queries,
      ['logitech g pro sensor specs', 'logitech g pro x superlight 2 dpi review'],
    );
    assert.equal(round1Histories.dpi_max.query_count, 2); // 1 from round 0 + 1 from round 1
    assert.deepStrictEqual(round1Histories.dpi_max.domains_tried, ['rtings.com']);
    assert.equal(round1Histories.dpi_max.no_value_attempts, 1); // was 1, now found value so no increment

    // VERIFY: weight accumulated and no_value_attempts incremented
    assert.deepStrictEqual(
      round1Histories.weight.existing_queries,
      ['logitech g pro x superlight weight', 'logitech gpx2 weight rtings'],
    );
    assert.equal(round1Histories.weight.query_count, 2);
    assert.equal(round1Histories.weight.no_value_attempts, 2); // 1 from round 0 + 1 from round 1

    // VERIFY: sensor_brand carried forward (not targeted in round 1 but preserved)
    assert.ok(round1Histories.sensor_brand, 'sensor_brand history must be preserved');
    assert.deepStrictEqual(
      round1Histories.sensor_brand.existing_queries,
      ['logitech g pro sensor specs'],
    );
    assert.deepStrictEqual(round1Histories.sensor_brand.domains_tried, ['logitech.com']);
  });

  it('host_classes_tried and evidence_classes_tried diversify across rounds', () => {
    // Round 0: manufacturer source
    const round0Histories = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'unk',
          evidence: [{
            url: 'https://logitech.com/spec',
            rootDomain: 'logitech.com',
            tier: 1,
            tierName: 'manufacturer',
            method: 'html',
          }],
        },
      },
      searchPlanQueries: [{ query: 'q1', target_fields: ['sensor_brand'] }],
    });

    assert.deepStrictEqual(round0Histories.sensor_brand.host_classes_tried, ['official']);
    assert.deepStrictEqual(round0Histories.sensor_brand.evidence_classes_tried, ['manufacturer_html']);

    // Round 1: review source
    const round1Histories = buildFieldHistories({
      previousFieldHistories: round0Histories,
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [{
            url: 'https://rtings.com/review',
            rootDomain: 'rtings.com',
            tier: 2,
            tierName: 'review',
            method: 'html',
          }],
        },
      },
      searchPlanQueries: [{ query: 'q2', target_fields: ['sensor_brand'] }],
    });

    // Both host classes and evidence classes should be accumulated
    assert.deepStrictEqual(
      round1Histories.sensor_brand.host_classes_tried,
      ['official', 'review'], // tier=1 → official, tierName=review → review
    );
    assert.deepStrictEqual(
      round1Histories.sensor_brand.evidence_classes_tried,
      ['manufacturer_html', 'review'], // tier=1 → manufacturer_html, tierName=review → review
    );
    assert.deepStrictEqual(
      round1Histories.sensor_brand.domains_tried,
      ['logitech.com', 'rtings.com'],
    );
  });

  it('3 rounds: weight field escalates no_value_attempts correctly', () => {
    let histories = {};

    // Round 0: targeted, no value
    histories = buildFieldHistories({
      previousFieldHistories: histories,
      provenance: { weight: { value: 'unk', evidence: [] } },
      searchPlanQueries: [{ query: 'mouse weight', target_fields: ['weight'] }],
    });
    assert.equal(histories.weight.no_value_attempts, 1);

    // Round 1: targeted again, still no value
    histories = buildFieldHistories({
      previousFieldHistories: histories,
      provenance: { weight: { value: 'n/a', evidence: [] } },
      searchPlanQueries: [{ query: 'mouse weight grams', target_fields: ['weight'] }],
    });
    assert.equal(histories.weight.no_value_attempts, 2);
    assert.equal(histories.weight.query_count, 2);

    // Round 2: targeted again, finally found
    histories = buildFieldHistories({
      previousFieldHistories: histories,
      provenance: {
        weight: {
          value: '63g',
          evidence: [{ url: 'https://rtings.com/w', rootDomain: 'rtings.com', tier: 2 }],
        },
      },
      searchPlanQueries: [{ query: 'gpx2 weight rtings', target_fields: ['weight'] }],
    });
    assert.equal(histories.weight.no_value_attempts, 2); // no increment — value found
    assert.equal(histories.weight.query_count, 3);
    assert.deepStrictEqual(histories.weight.existing_queries, [
      'gpx2 weight rtings',
      'mouse weight',
      'mouse weight grams',
    ]);
  });
});
