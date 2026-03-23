import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQueryJourneyRows,
  queryJourneyStatusLabel,
} from '../tools/gui-react/src/features/runtime-ops/selectors/prefetchQueryJourneyHelpers.js';

describe('buildQueryJourneyRows', () => {
  it('orders sent rows by timestamp and propagates tier metadata', () => {
    const rows = buildQueryJourneyRows({
      queryRows: [
        { query: 'mouse weight site:brand.com', target_fields: ['weight'], hint_source: 'tier3_key', tier: 'key_search', group_key: 'physical', normalized_key: 'weight', repeat_count: 0 },
        { query: 'mouse battery life', target_fields: ['battery_life'], hint_source: 'tier1_seed', tier: 'seed' },
      ],
      searchPlans: [
        {
          pass_index: 0,
          pass_name: 'primary',
          queries_generated: ['mouse battery life'],
          query_target_map: { 'mouse battery life': ['battery_life'] },
          missing_critical_fields: [],
          mode: 'standard',
          stop_condition: 'planner_complete',
          plan_rationale: 'primary pass',
        },
      ],
      searchResults: [
        { query: 'mouse battery life', provider: 'searxng', result_count: 3, duration_ms: 100, worker_id: 'w1', ts: '2026-02-24T10:00:01.000Z' },
        { query: 'mouse weight site:brand.com', provider: 'searxng', result_count: 1, duration_ms: 80, worker_id: 'w2', ts: '2026-02-24T10:00:02.000Z' },
      ],
    });

    assert.equal(rows.length, 2);
    // Sent rows ordered by timestamp
    assert.equal(rows[0].query, 'mouse battery life');
    assert.equal(rows[0].execution_order, 1);
    assert.equal(rows[0].selected_by, 'planner');
    assert.equal(rows[0].tier, 'seed');

    assert.equal(rows[1].query, 'mouse weight site:brand.com');
    assert.equal(rows[1].execution_order, 2);
    assert.equal(rows[1].tier, 'key_search');
    assert.equal(rows[1].group_key, 'physical');
    assert.equal(rows[1].normalized_key, 'weight');
    assert.equal(rows[1].repeat_count, 0);
  });

  it('derives lifecycle status and sorts unsent by tier priority', () => {
    const rows = buildQueryJourneyRows({
      queryRows: [
        { query: 'key query', target_fields: ['dpi'], tier: 'key_search' },
        { query: 'seed query', target_fields: [], tier: 'seed' },
        { query: 'group query', target_fields: ['sensor'], tier: 'group_search' },
        { query: 'sent query', target_fields: [], tier: 'seed' },
      ],
      searchResults: [
        { query: 'sent query', provider: 'google', result_count: 5, ts: '2026-02-24T10:00:00.000Z' },
      ],
    });

    // Sent first
    assert.equal(rows[0].query, 'sent query');
    assert.equal(rows[0].execution_order, 1);
    assert.equal(rows[0].status, 'results_received');

    // Unsent by tier: seed → group → key
    assert.equal(rows[1].query, 'seed query');
    assert.equal(rows[2].query, 'group query');
    assert.equal(rows[3].query, 'key query');

    assert.equal(rows[1].status, 'planned');
    assert.equal(rows[3].status, 'planned');

    assert.equal(queryJourneyStatusLabel('results_received'), 'Results received');
    assert.equal(queryJourneyStatusLabel('planned'), 'Planned');
  });
});
