// WHY: Contract test for stage cursor progression through the full pipeline.
// Verifies that the stepper bar follows Boot → Discover → Plan → Search →
// Select → Crawl → Finalize without skipping or jumping phases.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';
import { cursorToStageIndex } from '../../../tools/gui-react/src/features/runtime-ops/pipelineStepperRegistry.ts';

// WHY: Maps macro-stage index to label for readable assertions.
const STAGE_LABELS = ['Boot', 'Discover', 'Plan', 'Search', 'Select', 'Crawl', 'Finalize'];

function macroLabel(cursor) {
  const idx = cursorToStageIndex(cursor);
  return idx >= 0 ? STAGE_LABELS[idx] : `unknown(${cursor})`;
}

describe('cursor progression follows pipeline order', () => {
  it('run_started stays at Boot (does not jump to Discover)', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    assert.equal(bridge.stageCursor, 'stage:bootstrap',
      'cursor should be at bootstrap after run_started');
    assert.equal(macroLabel(bridge.stageCursor), 'Boot');
  });

  it('needset_computed advances to Discover (not Search)', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    bridge.onRuntimeEvent(baseRow({
      event: 'needset_computed',
      ts: '2025-01-01T00:00:05Z',
      total_fields: 30,
      needs: [],
    }));
    await bridge.queue;

    assert.equal(bridge.stageCursor, 'stage:needset');
    assert.equal(macroLabel(bridge.stageCursor), 'Discover');
  });

  it('brand_resolved advances within Discover', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    bridge.onRuntimeEvent(baseRow({
      event: 'brand_resolved',
      ts: '2025-01-01T00:00:06Z',
      brand: 'Razer',
      status: 'resolved',
    }));
    await bridge.queue;

    // brand-resolver or search are both in Discover macro-stage
    const label = macroLabel(bridge.stageCursor);
    assert.equal(label, 'Discover',
      `expected Discover, got ${label} (cursor: ${bridge.stageCursor})`);
  });

  it('full pipeline sequence hits every macro-stage in order', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    const observed = new Set();
    observed.add(macroLabel(bridge.stageCursor));

    const events = [
      { event: 'needset_computed', ts: '2025-01-01T00:00:05Z', total_fields: 30, needs: [] },
      { event: 'brand_resolved', ts: '2025-01-01T00:00:06Z', brand: 'Test', status: 'resolved' },
      { event: 'search_profile_generated', ts: '2025-01-01T00:00:10Z' },
      { event: 'search_plan_generated', ts: '2025-01-01T00:00:15Z', queries_generated: [] },
      { event: 'query_journey_completed', ts: '2025-01-01T00:00:20Z', selected_query_count: 3, selected_queries: [] },
      { event: 'discovery_query_started', ts: '2025-01-01T00:00:25Z', query: 'test specs', provider: 'google' },
      { event: 'serp_selector_completed', ts: '2025-01-01T00:00:30Z', kept_count: 5, dropped_count: 2 },
      { event: 'prime_sources_built', ts: '2025-01-01T00:00:35Z', fields_attempted: 10, fields_with_hits: 8 },
      { event: 'discovery_enqueue_summary', ts: '2025-01-01T00:00:40Z', enqueued_count: 5 },
      // Crawl fetch — should advance to Crawl
      { event: 'source_fetch_started', ts: '2025-01-01T00:00:45Z', url: 'https://example.com/page', host: 'example.com', tier: 1 },
    ];

    for (const ev of events) {
      bridge.onRuntimeEvent(baseRow(ev));
      await bridge.queue;
      observed.add(macroLabel(bridge.stageCursor));
    }

    // Finalize comes from run_completed
    bridge.onRuntimeEvent(baseRow({
      event: 'run_completed',
      ts: '2025-01-01T00:01:00Z',
      stage_cursor: 'stage:finalize',
    }));
    await bridge.queue;
    observed.add(macroLabel(bridge.stageCursor));

    const expected = new Set(STAGE_LABELS);
    assert.deepEqual(observed, expected,
      `should hit all 7 macro-stages. Missing: ${[...expected].filter(s => !observed.has(s)).join(', ')}`);
  });

  it('cursor never moves backward through macro-stages', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    const events = [
      { event: 'needset_computed', ts: '2025-01-01T00:00:05Z', total_fields: 30, needs: [] },
      { event: 'brand_resolved', ts: '2025-01-01T00:00:06Z', brand: 'Test', status: 'resolved' },
      { event: 'search_profile_generated', ts: '2025-01-01T00:00:10Z' },
      { event: 'search_plan_generated', ts: '2025-01-01T00:00:15Z', queries_generated: [] },
      { event: 'query_journey_completed', ts: '2025-01-01T00:00:20Z', selected_query_count: 3, selected_queries: [] },
      { event: 'discovery_query_started', ts: '2025-01-01T00:00:25Z', query: 'test specs', provider: 'google' },
      { event: 'serp_selector_completed', ts: '2025-01-01T00:00:30Z', kept_count: 5, dropped_count: 2 },
      { event: 'discovery_enqueue_summary', ts: '2025-01-01T00:00:40Z', enqueued_count: 5 },
      { event: 'source_fetch_started', ts: '2025-01-01T00:00:45Z', url: 'https://example.com', host: 'example.com', tier: 1 },
      { event: 'run_completed', ts: '2025-01-01T00:01:00Z', stage_cursor: 'stage:finalize' },
    ];

    let maxIdx = -1;
    for (const ev of events) {
      bridge.onRuntimeEvent(baseRow(ev));
      await bridge.queue;
      const idx = cursorToStageIndex(bridge.stageCursor);
      assert.ok(idx >= maxIdx,
        `cursor went backward: stage ${maxIdx} → ${idx} (cursor: ${bridge.stageCursor}) after ${ev.event}`);
      maxIdx = Math.max(maxIdx, idx);
    }
  });

  it('crawl cursor activates when fetch starts after domain-classifier', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    // Fast-forward to domain-classifier via discovery_enqueue_summary
    const setup = [
      { event: 'brand_resolved', ts: '2025-01-01T00:00:06Z', brand: 'X', status: 'resolved' },
      { event: 'search_profile_generated', ts: '2025-01-01T00:00:10Z' },
      { event: 'query_journey_completed', ts: '2025-01-01T00:00:20Z', selected_query_count: 1, selected_queries: [] },
      { event: 'discovery_query_started', ts: '2025-01-01T00:00:25Z', query: 'test', provider: 'google' },
      { event: 'serp_selector_completed', ts: '2025-01-01T00:00:30Z', kept_count: 3 },
      { event: 'discovery_enqueue_summary', ts: '2025-01-01T00:00:40Z', enqueued_count: 3 },
    ];
    for (const ev of setup) {
      bridge.onRuntimeEvent(baseRow(ev));
      await bridge.queue;
    }
    assert.equal(bridge.stageCursor, 'stage:domain-classifier',
      'precondition: cursor should be at domain-classifier');

    // First crawl fetch
    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_started',
      ts: '2025-01-01T00:00:45Z',
      url: 'https://crawl-target.com/page',
      host: 'crawl-target.com',
      tier: 1,
    }));
    await bridge.queue;

    assert.equal(bridge.stageCursor, 'stage:crawl');
    assert.equal(macroLabel(bridge.stageCursor), 'Crawl');
  });

  it('second crawl fetch does not regress cursor', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    const setup = [
      { event: 'brand_resolved', ts: '2025-01-01T00:00:06Z', brand: 'X', status: 'resolved' },
      { event: 'search_profile_generated', ts: '2025-01-01T00:00:10Z' },
      { event: 'query_journey_completed', ts: '2025-01-01T00:00:20Z', selected_query_count: 1, selected_queries: [] },
      { event: 'discovery_query_started', ts: '2025-01-01T00:00:25Z', query: 'test', provider: 'google' },
      { event: 'serp_selector_completed', ts: '2025-01-01T00:00:30Z', kept_count: 3 },
      { event: 'discovery_enqueue_summary', ts: '2025-01-01T00:00:40Z', enqueued_count: 3 },
      { event: 'source_fetch_started', ts: '2025-01-01T00:00:45Z', url: 'https://a.com', host: 'a.com', tier: 1 },
    ];
    for (const ev of setup) {
      bridge.onRuntimeEvent(baseRow(ev));
      await bridge.queue;
    }
    assert.equal(bridge.stageCursor, 'stage:crawl');

    // Second fetch — cursor should stay at crawl
    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_started',
      ts: '2025-01-01T00:00:50Z',
      url: 'https://b.com',
      host: 'b.com',
      tier: 1,
    }));
    await bridge.queue;

    assert.equal(bridge.stageCursor, 'stage:crawl',
      'cursor should remain at crawl for subsequent fetches');
  });
});
