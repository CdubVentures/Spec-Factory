import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHostPlanSummary } from '../tools/gui-react/src/features/runtime-ops/selectors/searchProfileHelpers.js';

describe('deriveHostPlanSummary', () => {
  it('returns zero defaults for null plan', () => {
    const summary = deriveHostPlanSummary(null);
    assert.equal(summary.hostCount, 0);
    assert.equal(summary.searchableHostCount, 0);
    assert.equal(summary.tierCount, 0);
    assert.equal(summary.blocked, false);
    assert.deepStrictEqual(summary.hostGroups, []);
  });

  it('returns blocked summary for blocked plan', () => {
    const summary = deriveHostPlanSummary({ blocked: true, reason: 'registry_underpopulated' });
    assert.equal(summary.blocked, true);
    assert.equal(summary.blockReason, 'registry_underpopulated');
    assert.equal(summary.hostCount, 0);
  });

  it('derives stats from valid plan', () => {
    const plan = {
      classification_summary: {
        host_count: 5,
        searchable_host_count: 3,
        tier_count: 2,
        intent_count: 1,
        unresolved_count: 0,
      },
      host_groups: [
        { host: 'a.com', origin: 'explicit', tier: 'tier1_manufacturer', searchable: true, health_action: 'normal' },
      ],
      explain: [
        { host: 'a.com', action: 'include', reason: 'explicit' },
      ],
      unresolved_tokens: [],
      provider_caps: { name: 'searxng' },
    };
    const summary = deriveHostPlanSummary(plan);
    assert.equal(summary.hostCount, 5);
    assert.equal(summary.searchableHostCount, 3);
    assert.equal(summary.tierCount, 2);
    assert.equal(summary.intentCount, 1);
    assert.equal(summary.unresolvedCount, 0);
    assert.equal(summary.providerName, 'searxng');
    assert.equal(summary.blocked, false);
    assert.equal(summary.hostGroups.length, 1);
    assert.equal(summary.explainEntries.length, 1);
  });
});
