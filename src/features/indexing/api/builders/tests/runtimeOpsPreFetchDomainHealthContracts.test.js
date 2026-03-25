import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: domains_classified merges domain health rows across events', () => {
  const result = buildPreFetchPhases([
    makeEvent('domains_classified', {
      classifications: [
        {
          domain: 'razer.com',
          role: 'manufacturer',
          safety_class: 'safe',
          cooldown_remaining: 0,
          success_rate: 0.98,
          avg_latency_ms: 450,
          notes: 'Primary manufacturer',
        },
      ],
    }),
    makeEvent('domains_classified', {
      classifications: [
        {
          domain: 'sketchy.site',
          role: 'unknown',
          safety_class: 'blocked',
          cooldown_remaining: 1800,
          success_rate: 0.1,
          avg_latency_ms: 5000,
          fetch_count: 12,
          blocked_count: 7,
          timeout_count: 3,
          last_blocked_ts: '2026-02-20T00:04:00.000Z',
          notes: 'Repeated 403s',
        },
      ],
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ], makeMeta(), {});

  assert.deepEqual(result.domain_health, [
    {
      domain: 'razer.com',
      role: 'manufacturer',
      safety_class: 'safe',
      cooldown_remaining: 0,
      success_rate: 0.98,
      avg_latency_ms: 450,
      fetch_count: 0,
      blocked_count: 0,
      timeout_count: 0,
      last_blocked_ts: null,
      notes: 'Primary manufacturer',
    },
    {
      domain: 'sketchy.site',
      role: 'unknown',
      safety_class: 'blocked',
      cooldown_remaining: 1800,
      success_rate: 0.1,
      avg_latency_ms: 5000,
      fetch_count: 12,
      blocked_count: 7,
      timeout_count: 3,
      last_blocked_ts: '2026-02-20T00:04:00.000Z',
      notes: 'Repeated 403s',
    },
  ]);
});
