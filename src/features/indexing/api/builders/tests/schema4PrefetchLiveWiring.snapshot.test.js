import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toNeedSetSnapshot,
  makeSchema4NeedsetComputedPayload,
} from './helpers/schema4PrefetchLiveWiringHarness.js';
// ---------------------------------------------------------------------------
// 1. toNeedSetSnapshot: Schema 4 fields preserved through payload shaper
// ---------------------------------------------------------------------------

test('toNeedSetSnapshot preserves bundles, profile_influence, deltas from Schema 4 event', () => {
  const raw = makeSchema4NeedsetComputedPayload();
  const snap = toNeedSetSnapshot(raw, '2026-03-16T00:01:00.000Z');

  // bundles
  assert.ok(Array.isArray(snap.bundles), 'bundles must be array');
  assert.equal(snap.bundles.length, 3, 'all 3 bundles preserved');
  assert.equal(snap.bundles[0].key, 'manufacturer_html');
  assert.equal(snap.bundles[0].phase, 'now');
  assert.equal(snap.bundles[0].priority, 'core');
  assert.equal(snap.bundles[0].queries.length, 2);
  assert.equal(snap.bundles[0].queries[0].q, 'Razer Viper V3 Pro specifications');
  assert.equal(snap.bundles[1].key, 'manual_pdf');
  assert.equal(snap.bundles[1].priority, 'secondary');
  assert.equal(snap.bundles[2].key, 'review_lookup');
  assert.equal(snap.bundles[2].phase, 'next');
  assert.equal(snap.bundles[2].priority, 'optional');

  // profile_influence
  assert.ok(snap.profile_influence && typeof snap.profile_influence === 'object', 'profile_influence must be object');
  assert.equal(snap.profile_influence.manufacturer_html, 2);
  assert.equal(snap.profile_influence.manual_pdf, 1);
  assert.equal(snap.profile_influence.total_queries, 4);
  assert.equal(snap.profile_influence.focused_bundles, 3);
  assert.equal(snap.profile_influence.duplicates_suppressed, 1);
  assert.equal(snap.profile_influence.trusted_host_share, 2);
  assert.equal(snap.profile_influence.docs_manual_share, 1);

  // deltas
  assert.ok(Array.isArray(snap.deltas), 'deltas must be array');
  assert.equal(snap.deltas.length, 3);
  assert.equal(snap.deltas[0].field, 'weight');
  assert.equal(snap.deltas[0].from, 'accepted');
  assert.equal(snap.deltas[0].to, 'weak');
  assert.equal(snap.deltas[2].field, 'click_latency');
  assert.equal(snap.deltas[2].from, null);
  assert.equal(snap.deltas[2].to, 'missing');

  // fields + planner_seed
  assert.ok(Array.isArray(snap.fields), 'fields must be array');
  assert.equal(snap.fields.length, 7);
  assert.equal(snap.fields[0].field_key, 'weight');
  assert.ok(snap.planner_seed && typeof snap.planner_seed === 'object', 'planner_seed preserved');
  assert.equal(snap.planner_seed.identity.brand, 'Razer');
  assert.equal(snap.schema_version, 'needset_planner_output.v2');
});
