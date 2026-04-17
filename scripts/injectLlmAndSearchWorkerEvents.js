#!/usr/bin/env node
/**
 * injectLlmAndSearchWorkerEvents.js — Injects realistic LLM worker + search worker
 * events into an existing run's NDJSON file so the Workers tab and LLM Dashboard
 * display correctly. Proves needset_planner appears in the LLM worker row.
 *
 * Usage: node scripts/injectLlmAndSearchWorkerEvents.js <eventsPath>
 */
import fs from 'node:fs/promises';

const RUN_ID = '20260316001421-7bdc5f';
const CATEGORY = 'mouse';
const PRODUCT_ID = 'mouse-razer-cobra-pro';

function makeTs(offsetMs) {
  return new Date(Date.parse('2026-03-16T00:14:24.000Z') + offsetMs).toISOString();
}

function evt(stage, event, payload, offsetMs) {
  return {
    run_id: RUN_ID,
    category: CATEGORY,
    product_id: PRODUCT_ID,
    ts: makeTs(offsetMs),
    stage,
    event,
    payload: payload || {},
  };
}

// ── LLM Workers ──────────────────────────────────────────────────
// Each LLM call is a pair: llm_started + llm_finished

const LLM_CALLS = [
  {
    call_type: 'needset_planner',
    reason: 'needset_search_planner',
    worker_id: 'llm-needset-planner-1',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    round: 1,
    prompt_tokens: 2847,
    completion_tokens: 1203,
    total_tokens: 4050,
    estimated_cost: 0.00115,
    duration_ms: 3420,
    prompt_preview: JSON.stringify({
      redacted: true,
      system_chars: 1800,
      user_chars: 3200,
    }),
    response_preview: JSON.stringify({
      groups: [
        { key: 'physical', queries: ['razer cobra pro weight grams dimensions'] },
        { key: 'connectivity', queries: ['razer cobra pro battery life wireless'] },
      ],
      planner_confidence: 0.82,
      targeted_exceptions: 2,
    }),
    startOffset: 500,
    endOffset: 3920,
  },
  {
    call_type: 'brand_resolver',
    reason: 'brand_resolution',
    worker_id: 'llm-brand-resolver-1',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    round: 1,
    prompt_tokens: 980,
    completion_tokens: 245,
    total_tokens: 1225,
    estimated_cost: 0.00029,
    duration_ms: 1840,
    prompt_preview: JSON.stringify({
      redacted: true,
      system_chars: 600,
      user_chars: 800,
    }),
    response_preview: JSON.stringify({
      brand: 'Razer',
      official_domain: 'razer.com',
      confidence: 0.98,
      aliases: ['Razer Inc', 'Razer USA'],
    }),
    startOffset: 100,
    endOffset: 1940,
  },
  {
    call_type: 'search_planner',
    reason: 'discovery_planner',
    worker_id: 'llm-search-planner-1',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    round: 1,
    prompt_tokens: 1540,
    completion_tokens: 890,
    total_tokens: 2430,
    estimated_cost: 0.00077,
    duration_ms: 2650,
    prompt_preview: JSON.stringify({
      redacted: true,
      system_chars: 1200,
      user_chars: 1500,
    }),
    response_preview: JSON.stringify({
      queries: [
        'razer cobra pro specs weight battery life',
        'razer cobra pro sensor dpi polling rate',
        'razer cobra pro dimensions length width',
      ],
      families: ['manufacturer_html', 'review_lookup'],
    }),
    startOffset: 2000,
    endOffset: 4650,
  },
  {
    call_type: 'serp_triage',
    reason: 'serp_rerank_triage',
    worker_id: 'llm-serp-triage-1',
    model: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    round: 1,
    prompt_tokens: 3200,
    completion_tokens: 410,
    total_tokens: 3610,
    estimated_cost: 0.00036,
    duration_ms: 1120,
    prompt_preview: JSON.stringify({
      redacted: true,
      system_chars: 900,
      user_chars: 4200,
    }),
    response_preview: JSON.stringify({
      kept: 8,
      dropped: 4,
      results: [
        { url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', score: 0.95 },
        { url: 'https://www.rtings.com/mouse/reviews/razer/cobra-pro', score: 0.88 },
      ],
    }),
    startOffset: 5000,
    endOffset: 6120,
  },
  {
    call_type: 'validation',
    reason: 'validate_candidates',
    worker_id: 'llm-validation-1',
    model: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    round: 1,
    prompt_tokens: 4100,
    completion_tokens: 620,
    total_tokens: 4720,
    estimated_cost: 0.00049,
    duration_ms: 1540,
    prompt_preview: JSON.stringify({
      redacted: true,
      system_chars: 800,
      user_chars: 5200,
    }),
    response_preview: JSON.stringify({
      validated: 12,
      rejected: 2,
      decisions: { weight: 'accept', dpi_max: 'accept', grip_style: 'reject' },
    }),
    startOffset: 14000,
    endOffset: 15540,
  },
];

// ── Search Workers ───────────────────────────────────────────────

const SEARCH_QUERIES = [
  { query: 'razer cobra pro specs weight battery life', source: 'llm', slot: 'A', results: 12, startOffset: 4700, endOffset: 6200 },
  { query: 'razer cobra pro sensor dpi polling rate review', source: 'llm', slot: 'B', results: 10, startOffset: 4800, endOffset: 6500 },
  { query: 'razer cobra pro dimensions length width height', source: 'targeted', slot: 'C', results: 8, startOffset: 5200, endOffset: 7000 },
  { query: 'site:razer.com razer cobra pro specifications', source: 'template', slot: 'D', results: 5, startOffset: 5500, endOffset: 7200 },
];

async function main() {
  const eventsPath = process.argv[2];
  if (!eventsPath) {
    console.error('Usage: node scripts/injectLlmAndSearchWorkerEvents.js <eventsPath>');
    process.exit(1);
  }

  console.log(`Injecting LLM + Search worker events into: ${eventsPath}`);

  const events = [];

  // LLM call events (started + finished pairs)
  for (const call of LLM_CALLS) {
    // llm_started
    events.push(evt('llm', 'llm_started', {
      scope: 'call',
      reason: call.reason,
      call_type: call.call_type,
      prefetch_tab: call.call_type === 'needset_planner' ? '01'
        : call.call_type === 'brand_resolver' ? '02'
        : call.call_type === 'search_planner' ? '04'
        : call.call_type === 'serp_triage' ? '07'
        : null,
      round: call.round,
      model: call.model,
      provider: call.provider,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost: 0,
      duration_ms: null,
      prompt_preview: call.prompt_preview,
      response_preview: '',
      worker_id: call.worker_id,
    }, call.startOffset));

    // llm_finished
    events.push(evt('llm', 'llm_finished', {
      scope: 'call',
      reason: call.reason,
      call_type: call.call_type,
      prefetch_tab: call.call_type === 'needset_planner' ? '01'
        : call.call_type === 'brand_resolver' ? '02'
        : call.call_type === 'search_planner' ? '04'
        : call.call_type === 'serp_triage' ? '07'
        : null,
      round: call.round,
      model: call.model,
      provider: call.provider,
      prompt_tokens: call.prompt_tokens,
      completion_tokens: call.completion_tokens,
      total_tokens: call.total_tokens,
      estimated_cost: call.estimated_cost,
      duration_ms: call.duration_ms,
      prompt_preview: call.prompt_preview,
      response_preview: call.response_preview,
      worker_id: call.worker_id,
    }, call.endOffset));
  }

  // Search worker events (started + finished pairs)
  for (const sq of SEARCH_QUERIES) {
    const wid = `search-${sq.slot}`;
    events.push(evt('search', 'search_started', {
      scope: 'query',
      query: sq.query,
      source: sq.source,
      slot: sq.slot,
      worker_id: wid,
    }, sq.startOffset));

    events.push(evt('search', 'search_finished', {
      scope: 'query',
      query: sq.query,
      source: sq.source,
      slot: sq.slot,
      worker_id: wid,
      results_count: sq.results,
      duration_ms: sq.endOffset - sq.startOffset,
    }, sq.endOffset));
  }

  // Sort by timestamp
  events.sort((a, b) => a.ts.localeCompare(b.ts));

  // Append all events
  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(eventsPath, lines, 'utf8');

  console.log(`\n=== Injection Complete ===`);
  console.log(`LLM calls injected: ${LLM_CALLS.length} (${LLM_CALLS.length * 2} events)`);
  console.log(`  Types: ${LLM_CALLS.map((c) => c.call_type).join(', ')}`);
  console.log(`Search queries injected: ${SEARCH_QUERIES.length} (${SEARCH_QUERIES.length * 2} events)`);
  console.log(`Total events added: ${events.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
