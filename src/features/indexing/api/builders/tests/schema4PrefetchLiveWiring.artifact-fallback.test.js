import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreFetchPhases,
  makeMeta,
  makeSchema4Fields,
  makeSchema4Panel,
} from './helpers/schema4PrefetchLiveWiringHarness.js';
// ---------------------------------------------------------------------------
// 5. Artifact fallback: Schema 4 data in needset artifact (post-finalization)
// ---------------------------------------------------------------------------

test('buildPreFetchPhases: Schema 4 data in needset artifact populates bundles, profile_influence, deltas', () => {
  const panel = makeSchema4Panel();
  const artifacts = {
    needset: {
      total_fields: 42,
      identity: { state: 'locked', confidence: 0.95 },
      fields: makeSchema4Fields(),
      summary: panel.summary,
      blockers: panel.blockers,
      bundles: panel.bundles,
      profile_influence: panel.profile_influence,
      deltas: panel.deltas,
      round: 0,
      schema_version: 'needset_planner_output.v2',
    },
  };

  const result = buildPreFetchPhases([], makeMeta(), artifacts);

  assert.equal(result.needset.bundles.length, 3, 'bundles from artifact');
  assert.equal(result.needset.bundles[0].priority, 'core');
  assert.equal(result.needset.bundles[0].queries.length, 2);
  assert.ok(result.needset.profile_influence, 'profile_influence from artifact');
  assert.equal(result.needset.profile_influence.total_queries, 4);
  assert.equal(result.needset.deltas.length, 3, 'deltas from artifact');
  assert.equal(result.needset.schema_version, 'needset_planner_output.v2');
  assert.equal(result.needset.fields.length, 7);
  assert.equal(result.needset.identity_state, 'locked');
});
