import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQueryJourneyRows,
  queryJourneyStatusLabel,
} from '../tools/gui-react/src/pages/runtime-ops/panels/prefetchQueryJourneyHelpers.js';

describe('buildQueryJourneyRows', () => {
  it('orders rows by first send time and marks selected-by source', () => {
    const rows = buildQueryJourneyRows({
      queryRows: [
        { query: 'mouse weight site:brand.com', target_fields: ['weight'], hint_source: 'field_rules.search_hints' },
        { query: 'mouse battery life', target_fields: ['battery_life'], hint_source: 'runtime_bridge' },
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
      searchResultDetails: [
        { query: 'mouse battery life', provider: 'searxng', dedupe_count: 0, results: [{ url: 'https://x.com', decision: 'keep' }] },
      ],
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].query, 'mouse battery life');
    assert.equal(rows[0].execution_order, 1);
    assert.equal(rows[0].selected_by, 'planner');
    assert.equal(rows[0].order_metric_label, 'T+0.0s');
    assert.match(String(rows[0].selected_by_tooltip || ''), /LLM search planner/i);
    assert.equal(rows[1].query, 'mouse weight site:brand.com');
    assert.equal(rows[1].execution_order, 2);
    assert.equal(rows[1].selected_by, 'deterministic');
    assert.equal(rows[1].order_metric_label, 'T+1.0s');
  });

  it('derives lifecycle status from planned/sent/results signals', () => {
    const rows = buildQueryJourneyRows({
      queryRows: [
        { query: 'planned-only query', target_fields: [] },
        { query: 'sent-no-results query', target_fields: [] },
        { query: 'results query', target_fields: [] },
      ],
      searchPlans: [],
      searchResults: [
        { query: 'sent-no-results query', provider: 'searxng', result_count: 0, duration_ms: 100, worker_id: 'w1', ts: '2026-02-24T10:00:03.000Z' },
        { query: 'results query', provider: 'searxng', result_count: 4, duration_ms: 120, worker_id: 'w2', ts: '2026-02-24T10:00:04.000Z' },
      ],
      searchResultDetails: [
        { query: 'results query', provider: 'searxng', dedupe_count: 0, results: [{ url: 'https://y.com', decision: 'keep' }] },
      ],
    });

    const byQuery = new Map(rows.map((row) => [row.query, row]));
    assert.equal(byQuery.get('planned-only query')?.status, 'planned');
    assert.equal(byQuery.get('sent-no-results query')?.status, 'sent');
    assert.equal(byQuery.get('results query')?.status, 'results_received');
    assert.match(String(byQuery.get('planned-only query')?.order_metric_label || ''), /^P\d+/);
    assert.match(String(byQuery.get('planned-only query')?.order_justification || ''), /Not sent yet/i);
    assert.match(String(byQuery.get('results query')?.order_justification || ''), /runtime timestamp ordering|First query sent/i);
    assert.equal(queryJourneyStatusLabel('results_received'), 'Results received');
  });
});
