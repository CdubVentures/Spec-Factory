import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichNeedSetFieldHistories } from '../src/features/indexing/orchestration/finalize/enrichNeedSetFieldHistories.js';
import { buildFinalizationEventPayloads } from '../src/features/indexing/orchestration/finalize/buildFinalizationEventPayloads.js';
import { emitFinalizationEvents } from '../src/features/indexing/orchestration/finalize/emitFinalizationEvents.js';
import { buildFieldHistories } from '../src/indexlab/buildFieldHistories.js';
import { buildRunSummaryIdentityDiscoverySection } from '../src/features/indexing/orchestration/finalize/buildRunSummaryIdentityDiscoverySection.js';

// WHY: This integration test proves the COMPLETE field history data path works
// end-to-end, from enrichment through event emission. It exercises every function
// in the chain that the production pipeline uses, with realistic data that simulates
// a real run with search/discovery and extraction results.

describe('field history end-to-end pipeline proof', () => {
  // Realistic provenance from a run that found some values
  const provenance = {
    sensor_brand: {
      value: 'HERO 2',
      evidence: [{
        url: 'https://www.logitech.com/en-us/products/gaming-mice/pro-x2-superlight-wireless-mouse.html',
        rootDomain: 'logitech.com',
        tier: 1,
        tierName: 'manufacturer',
        method: 'html',
      }],
    },
    dpi_max: {
      value: '32000',
      evidence: [{
        url: 'https://www.rtings.com/mouse/reviews/logitech/g-pro-x-superlight-2',
        rootDomain: 'rtings.com',
        tier: 2,
        tierName: 'review',
        method: 'html',
      }],
    },
    weight: { value: 'unk', evidence: [] },
    connection_type: {
      value: 'wireless',
      evidence: [{
        url: 'https://www.logitech.com/en-us/products/gaming-mice/pro-x2-superlight-wireless-mouse.html',
        rootDomain: 'logitech.com',
        tier: 1,
        tierName: 'manufacturer',
        method: 'html',
      }, {
        url: 'https://www.rtings.com/mouse/reviews/logitech/g-pro-x-superlight-2',
        rootDomain: 'rtings.com',
        tier: 2,
        tierName: 'review',
        method: 'html',
      }],
    },
  };

  // Realistic discovery queries from the search planner
  const discoveryQueries = [
    { query: 'logitech g pro x superlight 2 specs', source: 'llm', target_fields: ['sensor_brand', 'dpi_max', 'weight', 'connection_type'] },
    { query: 'logitech gpx2 weight grams review', source: 'llm', target_fields: ['weight'] },
    { query: 'logitech pro x superlight 2 sensor review', source: 'targeted', target_fields: ['sensor_brand', 'dpi_max'] },
  ];

  // NeedSet fields (round 0, empty history — mimics computeNeedSet output)
  const makeFields = () => [
    { field_key: 'sensor_brand', state: 'missing', group_key: 'sensor', required_level: 'critical', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    { field_key: 'dpi_max', state: 'missing', group_key: 'sensor', required_level: 'required', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    { field_key: 'weight', state: 'missing', group_key: 'general', required_level: 'required', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    { field_key: 'connection_type', state: 'accepted', group_key: 'connectivity', required_level: 'required', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
  ];

  it('LINK 1: enrichNeedSetFieldHistories merges discovery data into empty-history fields', () => {
    const fields = makeFields();
    const enriched = enrichNeedSetFieldHistories({
      fields,
      provenance,
      searchPlanQueries: discoveryQueries,
    });

    assert.equal(enriched.length, 4);

    // sensor_brand: found value, targeted by 2 queries
    const sensor = enriched.find((f) => f.field_key === 'sensor_brand');
    assert.deepStrictEqual(sensor.history.existing_queries, [
      'logitech g pro x superlight 2 specs',
      'logitech pro x superlight 2 sensor review',
    ]);
    assert.equal(sensor.history.query_count, 2);
    assert.deepStrictEqual(sensor.history.domains_tried, ['logitech.com']);
    assert.deepStrictEqual(sensor.history.host_classes_tried, ['official']);
    assert.deepStrictEqual(sensor.history.evidence_classes_tried, ['manufacturer_html']);
    assert.equal(sensor.history.no_value_attempts, 0); // found value
    assert.equal(sensor.history.urls_examined_count, 1);

    // weight: targeted by 2 queries, no value found
    const weight = enriched.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(weight.history.existing_queries, [
      'logitech g pro x superlight 2 specs',
      'logitech gpx2 weight grams review',
    ]);
    assert.equal(weight.history.query_count, 2);
    assert.equal(weight.history.no_value_attempts, 1); // targeted, no value
    assert.deepStrictEqual(weight.history.domains_tried, []);

    // dpi_max: found value, 2 queries, tier=2 + tierName=review → host_class='review'
    const dpi = enriched.find((f) => f.field_key === 'dpi_max');
    assert.equal(dpi.history.query_count, 2);
    assert.deepStrictEqual(dpi.history.domains_tried, ['rtings.com']);
    assert.deepStrictEqual(dpi.history.host_classes_tried, ['review']);
    assert.equal(dpi.history.no_value_attempts, 0);

    // connection_type: found value, 2 evidence sources, targeted by 1 query
    // logitech.com tier=1 → 'official', rtings.com tier=2 tierName=review → 'review'
    const conn = enriched.find((f) => f.field_key === 'connection_type');
    assert.equal(conn.history.query_count, 1);
    assert.deepStrictEqual(conn.history.domains_tried, ['logitech.com', 'rtings.com']);
    assert.deepStrictEqual(conn.history.host_classes_tried, ['official', 'review']);
    assert.equal(conn.history.urls_examined_count, 2);
  });

  it('LINK 2: buildFinalizationEventPayloads preserves enriched fields in needsetComputedPayload', () => {
    const enrichedFields = enrichNeedSetFieldHistories({
      fields: makeFields(),
      provenance,
      searchPlanQueries: discoveryQueries,
    });

    const needSet = {
      fields: enrichedFields,
      total_fields: 4,
      summary: {},
      blockers: {},
      bundles: [],
      profile_influence: null,
      deltas: [],
      round: 0,
      round_mode: 'seed',
      schema_version: 'needset_planner_output.v2',
    };

    const { needsetComputedPayload } = buildFinalizationEventPayloads({
      productId: 'mouse-logitech-g-pro-x-superlight-2',
      runId: '20260316-test-proof',
      category: 'mouse',
      needSet,
      needSetRunKey: 'ns-key',
    });

    // Fields must be projected into the payload
    assert.ok(Array.isArray(needsetComputedPayload.fields), 'fields must be an array');
    assert.equal(needsetComputedPayload.fields.length, 4);

    // Spot-check: weight field has enriched history
    const weight = needsetComputedPayload.fields.find((f) => f.field_key === 'weight');
    assert.ok(weight, 'weight field must be in payload');
    assert.equal(weight.history.no_value_attempts, 1);
    assert.equal(weight.history.query_count, 2);
    assert.deepStrictEqual(weight.history.existing_queries, [
      'logitech g pro x superlight 2 specs',
      'logitech gpx2 weight grams review',
    ]);
  });

  it('LINK 3: emitFinalizationEvents delivers fields with history to the logger', () => {
    const enrichedFields = enrichNeedSetFieldHistories({
      fields: makeFields(),
      provenance,
      searchPlanQueries: discoveryQueries,
    });

    const needSet = {
      fields: enrichedFields,
      total_fields: 4,
      summary: {},
      blockers: {},
      bundles: [],
      profile_influence: null,
      deltas: [],
      round: 0,
      round_mode: 'seed',
      schema_version: null,
    };

    const finalizationEventPayloads = buildFinalizationEventPayloads({
      productId: 'test-product',
      runId: 'test-run',
      category: 'mouse',
      needSet,
    });

    // Capture what the logger receives
    const captured = [];
    const logger = {
      info(event, payload) {
        captured.push({ event, payload });
      },
    };

    emitFinalizationEvents({ logger, finalizationEventPayloads });

    // Find the needset_computed event
    const ncEvent = captured.find((e) => e.event === 'needset_computed');
    assert.ok(ncEvent, 'needset_computed event must be emitted');

    const eventFields = ncEvent.payload.fields;
    assert.ok(Array.isArray(eventFields), 'event payload must have fields array');
    assert.equal(eventFields.length, 4);

    // The sensor_brand field has full history in the event
    const sensor = eventFields.find((f) => f.field_key === 'sensor_brand');
    assert.ok(sensor.history, 'sensor_brand must have history');
    assert.equal(sensor.history.query_count, 2);
    assert.deepStrictEqual(sensor.history.domains_tried, ['logitech.com']);
    assert.deepStrictEqual(sensor.history.host_classes_tried, ['official']);

    // The weight field shows it needs attention
    const weight = eventFields.find((f) => f.field_key === 'weight');
    assert.equal(weight.history.no_value_attempts, 1);
    assert.deepStrictEqual(weight.history.domains_tried, []);
  });

  it('LINK 4: buildRunSummaryIdentityDiscoverySection surfaces searchPlanQueries from discovery', () => {
    const discoveryResult = {
      enabled: true,
      discoveryKey: 'disc-key',
      candidatesKey: 'cand-key',
      candidates: [],
      search_attempts: [],
      queries: discoveryQueries,
    };

    const section = buildRunSummaryIdentityDiscoverySection({ discoveryResult });

    assert.ok(Array.isArray(section.searchPlanQueries), 'searchPlanQueries must be array');
    assert.equal(section.searchPlanQueries.length, 3);
    assert.deepStrictEqual(section.searchPlanQueries[0], {
      query: 'logitech g pro x superlight 2 specs',
      target_fields: ['sensor_brand', 'dpi_max', 'weight', 'connection_type'],
    });
  });

  it('LINK 5: buildFieldHistories uses searchPlanQueries from summary', () => {
    const section = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: {
        enabled: true,
        discoveryKey: 'dk',
        candidatesKey: 'ck',
        candidates: [],
        queries: discoveryQueries,
      },
    });

    const histories = buildFieldHistories({
      previousFieldHistories: {},
      provenance,
      searchPlanQueries: section.searchPlanQueries,
    });

    // Verify histories are correct for next round
    assert.ok(histories.sensor_brand, 'sensor_brand must have history');
    assert.equal(histories.sensor_brand.query_count, 2);
    assert.deepStrictEqual(histories.sensor_brand.domains_tried, ['logitech.com']);

    assert.ok(histories.weight, 'weight must have history');
    assert.equal(histories.weight.no_value_attempts, 1);
    assert.equal(histories.weight.query_count, 2);

    assert.ok(histories.dpi_max, 'dpi_max must have history');
    assert.equal(histories.dpi_max.query_count, 2);
    assert.deepStrictEqual(histories.dpi_max.domains_tried, ['rtings.com']);
  });

  it('FULL CHAIN: round 0 enrichment → round 1 accumulation → final event has complete history', () => {
    // === ROUND 0 ===
    const round0Fields = makeFields();
    const round0Enriched = enrichNeedSetFieldHistories({
      fields: round0Fields,
      provenance,
      searchPlanQueries: discoveryQueries,
    });

    // Round 0 event payload
    const round0Payload = buildFinalizationEventPayloads({
      productId: 'test-product',
      runId: 'round-0',
      category: 'mouse',
      needSet: {
        fields: round0Enriched,
        total_fields: 4,
        summary: {},
        blockers: {},
      },
    });

    // Verify round 0 weight has 1 no_value_attempt
    const round0Weight = round0Payload.needsetComputedPayload.fields.find((f) => f.field_key === 'weight');
    assert.equal(round0Weight.history.no_value_attempts, 1);
    assert.equal(round0Weight.history.query_count, 2);

    // === ROUND 1: new queries, weight still not found ===
    // Simulate computeNeedSet carrying forward round 0's enriched history
    const round1Fields = round0Enriched.map((f) => ({ ...f })); // carry forward from round 0
    // Update weight state to still missing
    const round1Weight = round1Fields.find((f) => f.field_key === 'weight');
    round1Weight.state = 'missing';

    const round1Provenance = {
      weight: { value: 'unk', evidence: [] }, // still not found
      sensor_brand: {
        value: 'HERO 2',
        evidence: [{ url: 'https://pcgamingwiki.com/logitech', rootDomain: 'pcgamingwiki.com', tier: 3, method: 'html' }],
      },
    };

    const round1Queries = [
      { query: 'logitech gpx2 weight grams techpowerup', target_fields: ['weight'] },
    ];

    const round1Enriched = enrichNeedSetFieldHistories({
      fields: round1Fields,
      provenance: round1Provenance,
      searchPlanQueries: round1Queries,
    });

    // Round 1 event payload
    const round1Payload = buildFinalizationEventPayloads({
      productId: 'test-product',
      runId: 'round-1',
      category: 'mouse',
      needSet: {
        fields: round1Enriched,
        total_fields: 4,
        summary: {},
        blockers: {},
      },
    });

    // Verify round 1 weight accumulated data across rounds
    const finalWeight = round1Payload.needsetComputedPayload.fields.find((f) => f.field_key === 'weight');
    assert.equal(finalWeight.history.no_value_attempts, 2); // round 0 + round 1
    assert.equal(finalWeight.history.query_count, 3); // 2 from round 0 + 1 from round 1
    assert.deepStrictEqual(finalWeight.history.existing_queries, [
      'logitech g pro x superlight 2 specs',
      'logitech gpx2 weight grams review',
      'logitech gpx2 weight grams techpowerup',
    ]);

    // Verify sensor_brand accumulated domains across rounds
    const finalSensor = round1Payload.needsetComputedPayload.fields.find((f) => f.field_key === 'sensor_brand');
    assert.deepStrictEqual(finalSensor.history.domains_tried, ['logitech.com', 'pcgamingwiki.com']);
    assert.deepStrictEqual(finalSensor.history.host_classes_tried, ['community', 'official']);
    assert.equal(finalSensor.history.query_count, 2); // no new queries in round 1
    assert.equal(finalSensor.history.no_value_attempts, 0); // always had value
  });
});
