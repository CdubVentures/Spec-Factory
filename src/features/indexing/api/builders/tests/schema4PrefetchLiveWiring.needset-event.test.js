import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreFetchPhases,
  makeEvent,
  makeMeta,
  makeSchema4NeedsetComputedPayload,
} from './helpers/schema4PrefetchLiveWiringHarness.js';
// ---------------------------------------------------------------------------
// 2. buildPreFetchPhases: needset_computed with full Schema 4 payload
//    populates every needset field used by the GUI panel
// ---------------------------------------------------------------------------

test('buildPreFetchPhases: Schema 4 needset_computed populates bundles, profile_influence, deltas', () => {
  const events = [
    makeEvent('needset_computed', makeSchema4NeedsetComputedPayload()),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});

  // top-level needset fields
  assert.ok(result.needset, 'needset must exist');
  assert.equal(result.needset.total_fields, 0, 'total_fields derived from panel summary (not in panel root, falls back to 0)');
  assert.equal(result.needset.identity_state, 'locked');
  assert.equal(result.needset.round, 0);
  assert.equal(result.needset.schema_version, 'needset_planner_output.v2');

  // fields
  assert.equal(result.needset.fields.length, 7, 'all 7 Schema 2 fields passed through');
  assert.equal(result.needset.fields[0].field_key, 'weight');
  assert.equal(result.needset.fields[4].field_key, 'polling_rate');

  // summary + blockers
  assert.equal(result.needset.summary.total, 42);
  assert.equal(result.needset.summary.resolved, 18);
  assert.equal(result.needset.blockers.missing, 12);
  assert.equal(result.needset.blockers.weak, 7);
  assert.equal(result.needset.blockers.conflict, 3);

  // bundles (Schema 4 panel data)
  assert.ok(Array.isArray(result.needset.bundles), 'bundles must be array');
  assert.equal(result.needset.bundles.length, 3);

  const coreBundle = result.needset.bundles[0];
  assert.equal(coreBundle.key, 'manufacturer_html');
  assert.equal(coreBundle.phase, 'now');
  assert.equal(coreBundle.priority, 'core');
  assert.ok(Array.isArray(coreBundle.queries), 'queries must be array');
  assert.equal(coreBundle.queries.length, 2);
  assert.equal(coreBundle.queries[0].q, 'Razer Viper V3 Pro specifications');
  assert.equal(coreBundle.queries[0].family, 'manufacturer_html');
  assert.equal(coreBundle.source_target, 'razer.com');
  assert.equal(coreBundle.host_class, 'manufacturer');
  assert.ok(Array.isArray(coreBundle.fields), 'bundle.fields must be array');
  assert.equal(coreBundle.fields.length, 3);

  const secondaryBundle = result.needset.bundles[1];
  assert.equal(secondaryBundle.key, 'manual_pdf');
  assert.equal(secondaryBundle.phase, 'now');
  assert.equal(secondaryBundle.priority, 'secondary');
  assert.equal(secondaryBundle.queries.length, 1);

  const optionalBundle = result.needset.bundles[2];
  assert.equal(optionalBundle.key, 'review_lookup');
  assert.equal(optionalBundle.phase, 'next');
  assert.equal(optionalBundle.priority, 'optional');

  // profile_influence (Schema 4 panel data)
  assert.ok(result.needset.profile_influence && typeof result.needset.profile_influence === 'object', 'profile_influence must be object');
  assert.equal(result.needset.profile_influence.manufacturer_html, 2);
  assert.equal(result.needset.profile_influence.manual_pdf, 1);
  assert.equal(result.needset.profile_influence.review_lookup, 1);
  assert.equal(result.needset.profile_influence.total_queries, 4);
  assert.equal(result.needset.profile_influence.focused_bundles, 3);
  assert.equal(result.needset.profile_influence.duplicates_suppressed, 1);
  assert.equal(result.needset.profile_influence.trusted_host_share, 2);
  assert.equal(result.needset.profile_influence.docs_manual_share, 1);

  // deltas (Schema 4 panel data)
  assert.ok(Array.isArray(result.needset.deltas), 'deltas must be array');
  assert.equal(result.needset.deltas.length, 3);
  assert.equal(result.needset.deltas[0].field, 'weight');
  assert.equal(result.needset.deltas[0].from, 'accepted');
  assert.equal(result.needset.deltas[0].to, 'weak');
  assert.equal(result.needset.deltas[1].field, 'sensor');
  assert.equal(result.needset.deltas[1].from, 'missing');
  assert.equal(result.needset.deltas[1].to, 'weak');
  assert.equal(result.needset.deltas[2].field, 'click_latency');
  assert.equal(result.needset.deltas[2].from, null);
  assert.equal(result.needset.deltas[2].to, 'missing');

  // snapshots
  assert.equal(result.needset.snapshots.length, 1);
  assert.equal(result.needset.snapshots[0].identity_state, 'locked');
});
