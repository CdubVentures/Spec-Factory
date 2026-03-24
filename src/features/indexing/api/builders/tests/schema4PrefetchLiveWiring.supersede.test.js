import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreFetchPhases,
  makeEvent,
  makeMeta,
  makeSchema4Fields,
  makeSchema4NeedsetComputedPayload,
} from './helpers/schema4PrefetchLiveWiringHarness.js';
// ---------------------------------------------------------------------------
// 4. Schema 4 needset_computed supersedes initial needset_computed (2 events)
//    Proves the live Schema 4 emission overwrites the bootstrap baseline
// ---------------------------------------------------------------------------

test('buildPreFetchPhases: Schema 4 needset_computed supersedes initial baseline needset', () => {
  const events = [
    // Initial baseline (from bootstrapRunProductExecutionState)
    makeEvent('needset_computed', {
      needset_size: 24,
      total_fields: 42,
      identity: { state: 'provisional' },
      fields: makeSchema4Fields(),
      summary: { total: 42, resolved: 0 },
      blockers: { missing: 24, weak: 0, conflict: 0 },
      scope: 'initial',
      bundles: [],
      profile_influence: null,
      deltas: [],
    }, { ts: '2026-03-16T00:00:01.000Z' }),
    // Schema 4 planner emission (from runDiscoverySeedPlan)
    makeEvent('needset_computed', makeSchema4NeedsetComputedPayload(), { ts: '2026-03-16T00:00:05.000Z' }),
  ];

  const result = buildPreFetchPhases(events, makeMeta(), {});

  // Schema 4 data wins (it's the last needset_computed event)
  assert.equal(result.needset.identity_state, 'locked', 'identity upgraded from provisional → locked');
  assert.equal(result.needset.bundles.length, 3, 'Schema 4 bundles present');
  assert.ok(result.needset.profile_influence, 'profile_influence populated');
  assert.equal(result.needset.profile_influence.total_queries, 4);
  assert.equal(result.needset.deltas.length, 3, 'deltas populated');
  assert.equal(result.needset.schema_version, 'needset_planner_output.v2');

  // Snapshots show both events
  assert.equal(result.needset.snapshots.length, 2, '2 needset snapshots');
  assert.equal(result.needset.snapshots[0].identity_state, 'provisional', 'first snapshot is baseline');
  assert.equal(result.needset.snapshots[1].identity_state, 'locked', 'second snapshot is Schema 4');

  // Summary/blockers from Schema 4 panel
  assert.equal(result.needset.summary.total, 42);
  assert.equal(result.needset.summary.resolved, 18);
  assert.equal(result.needset.blockers.missing, 12);
});
