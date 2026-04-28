// WHY: Serializes all run telemetry (GUI dashboard data) into a single
// run-summary.json at finalize time. The GUI reads this file for past runs
// instead of querying bridge_events SQL + runs SQL + run_artifacts SQL.
// Product knowledge (needset, search_profile, brand_resolution) stays in SQL.

import {
  RUN_SUMMARY_SCHEMA_VERSION,
  RUN_SUMMARY_EVENTS_LIMIT,
} from '../features/indexing/api/contracts/runSummaryContract.js';

/**
 * Build the run-summary.json payload from bridge in-memory state + SQL events.
 * Called at finalize() BEFORE maps are cleared and trackers are reset.
 * @param {object} state — the IndexLabRuntimeBridge instance
 * @returns {object} run-summary.json payload matching the contract
 */
export async function serializeRunSummary(state) {
  const asInt = (v, fallback = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; };

  // ── telemetry.meta (same assembly as writeRunMeta lines 54-102) ──
  const meta = {
    run_id: state.runId || '',
    category: state.context?.category || '',
    product_id: state.context?.productId || '',
    status: state.status || 'running',
    started_at: state.startedAt || '',
    ended_at: state.endedAt || '',
    stage_cursor: state.stageCursor || '',
    boot_step: state.bootStep || '',
    boot_progress: state.bootProgress || 0,
    identity_fingerprint: state.identityFingerprint || '',
    identity_lock_status: state.identityLockStatus || '',
    dedupe_mode: state.dedupeMode || '',
    s3key: state.context?.s3Key || '',
    out_root: state.outRoot || '',
    counters: state.counters || {},
    stages: state.stageState || {},
    startup_ms: state.startupMs || {},
    browser_pool: state.browserPool || null,
    needset_summary: state.needSet
      ? {
        total_fields: asInt(state.needSet.total_fields, 0),
        generated_at: state.needSet.generated_at || null,
        summary: state.needSet.summary || null,
        rows_count: Array.isArray(state.needSet.rows) ? state.needSet.rows.length : 0,
      }
      : null,
    search_profile_summary: state.searchProfile
      ? {
        status: String(state.searchProfile.status || '').trim() || 'pending',
        query_count: asInt(
          state.searchProfile.query_count
          ?? state.searchProfile.selected_query_count
          ?? (Array.isArray(state.searchProfile.query_rows) ? state.searchProfile.query_rows.length : 0),
          0
        ),
        generated_at: state.searchProfile.generated_at || null,
      }
      : null,
    artifacts: {
      has_needset: Boolean(state.needSet),
      has_search_profile: Boolean(state.searchProfile),
    },
  };

  // ── telemetry.events (read from SQL — bridge doesn't buffer events in-memory) ──
  let events = [];
  let event_limit = {
    limit: RUN_SUMMARY_EVENTS_LIMIT,
    captured: 0,
    truncated: false,
  };
  if (state.specDb && state.runId) {
    try {
      const rawEvents = state.specDb.getBridgeEventsByRunId(
        state.runId,
        RUN_SUMMARY_EVENTS_LIMIT + 1
      ) || [];
      const truncated = rawEvents.length > RUN_SUMMARY_EVENTS_LIMIT;
      events = truncated
        ? rawEvents.slice(rawEvents.length - RUN_SUMMARY_EVENTS_LIMIT)
        : rawEvents;
      event_limit = {
        limit: RUN_SUMMARY_EVENTS_LIMIT,
        captured: events.length,
        truncated,
      };
    } catch { /* best-effort: empty events if SQL fails */ }
  }

  // ── telemetry.llm_agg (from in-memory tracker, available before reset) ──
  const llm_agg = state._llmAgg
    ? { ...state._llmAgg }
    : {
      total_calls: 0, completed_calls: 0, failed_calls: 0, active_calls: 0,
      total_prompt_tokens: 0, total_completion_tokens: 0, total_cost: 0,
      calls_by_type: {}, calls_by_model: {},
    };

  // ── telemetry.observability (from in-memory bridge counters) ──
  const observability = typeof state.getObservability === 'function'
    ? { ...state.getObservability() }
    : {
      search_finish_without_start: 0, search_slot_reuse: 0, search_unique_slots: 0,
      llm_missing_telemetry: 0, llm_orphan_finish: 0,
      bridge_event_errors: 0, bridge_finalize_errors: 0,
    };

  return {
    schema_version: RUN_SUMMARY_SCHEMA_VERSION,
    telemetry: { meta, events, event_limit, llm_agg, observability },
  };
}

/**
 * Extract the events array from a run-summary.json payload.
 * Used by GUI readers to get the same events[] that builders expect.
 * @param {object} summary — parsed run-summary.json
 * @returns {Array} bridge events array (may be empty)
 */
export function extractEventsFromRunSummary(summary) {
  if (!summary || typeof summary !== 'object') return [];
  if (summary.telemetry?.events) return summary.telemetry.events;
  return [];
}

/**
 * Extract the meta object from a run-summary.json payload.
 * Used by GUI readers to get run metadata without querying runs SQL.
 * @param {object} summary — parsed run-summary.json
 * @returns {object|null} meta object or null
 */
export function extractMetaFromRunSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  return summary.telemetry?.meta || null;
}
