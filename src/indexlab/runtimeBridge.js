import path from 'node:path';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { toIso } from './runtimeBridgeCoercers.js';
import { createSearchSlotScheduler } from './runtimeBridgeSearchSlots.js';
import { createLlmCallTracker } from './runtimeBridgeLlmTracker.js';
import {
  writeRunMeta, ensureBaselineArtifacts,
  writeRunSummaryArtifact
} from './runtimeBridgeArtifacts.js';
import { serializeRunSummary } from './runSummarySerializer.js';
import { setStageCursor, finishStage } from './runtimeBridgeStageLifecycle.js';
import { dispatchRuntimeEvent } from './runtimeBridgeEventHandlers.js';

export class IndexLabRuntimeBridge {
  constructor({ outRoot = defaultIndexLabRoot(), context = {}, onEvent = null, specDb = null } = {}) {
    this.outRoot = path.resolve(String(outRoot || defaultIndexLabRoot()));
    this.context = { ...(context || {}) };
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.specDb = specDb || null;
    this.screencastTarget = '';

    this.runId = '';
    this.runDir = '';
    this.runMetaPath = '';
    this.startedAt = '';
    this.endedAt = '';
    this.status = 'running';
    this.needSet = null;
    this.searchProfile = null;
    this.identityFingerprint = '';
    this.identityLockStatus = '';
    this.dedupeMode = '';
    this.stageCursor = 'stage:bootstrap';
    this.startupMs = {
      first_event: null,
      search_started: null,
      fetch_started: null,
      parse_started: null,
      index_started: null
    };

    this.stageState = {
      search: { started_at: '', ended_at: '' },
      fetch: { started_at: '', ended_at: '' },
      parse: { started_at: '', ended_at: '' },
      index: { started_at: '', ended_at: '' }
    };
    this.fetchByUrl = new Map();
    this.fetchClosedByUrl = new Set();
    this.workerByUrl = new Map();
    // WHY: Per-field provenance accumulator. Populated from source_processed
    // events (one evidence entry per source that contributed a candidate).
    // Consumed at finalization by buildFieldHistories to derive next-run
    // roundContext.previousFieldHistories — drives tier-3 3a→3b→3c→3d progression.
    this.fieldProvenance = {};
    this.queue = Promise.resolve();
    this.counters = {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
      search_workers: 0
    };
    this._observability = {
      search_finish_without_start: 0,
      search_slot_reuse: 0,
      search_unique_slots: 0,
      llm_missing_telemetry: 0,
      llm_orphan_finish: 0,
      bridge_event_errors: 0,
      bridge_finalize_errors: 0,
    };
    this._searchSlotScheduler = createSearchSlotScheduler({
      observability: this._observability,
      counters: this.counters
    });
    this._llmTracker = createLlmCallTracker();
  }

  // WHY: backward-compat — tests inspect these internal properties directly
  get _searchSlots() { return this._searchSlotScheduler.getSlots(); }
  get _queryToSlot() { return this._searchSlotScheduler.getQueryToSlot(); }
  get _searchNextSlotIndex() { return this._searchSlotScheduler.getNextSlotIndex(); }
  get _llmCallMap() { return this._llmTracker.getLlmCallMap(); }
  get _llmSeenWorkers() { return this._llmTracker.getLlmSeenWorkers(); }
  get _llmAgg() { return this._llmTracker.getLlmAgg(); }
  get _llmCounter() { return this._llmTracker.getLlmCounter(); }

  getObservability() {
    return {
      ...this._observability,
      search_unique_slots: this._searchSlotScheduler.getSlots().size,
    };
  }

  setContext(next = {}) {
    this.context = {
      ...this.context,
      ...next
    };
  }

  onRuntimeEvent(row = {}) {
    this.queue = this.queue
      .then(() => dispatchRuntimeEvent(this, {
        searchSlots: this._searchSlotScheduler,
        llmTracker: this._llmTracker,
      }, row))
      .catch((err) => {
        this._observability.bridge_event_errors += 1;
        if (typeof console !== 'undefined') console.error('[IndexLabRuntimeBridge] event error:', err?.message || String(err));
      });
    return this.queue;
  }

  async finalize(summary = {}) {
    this.queue = this.queue
      .then(async () => {
        const endedAt = toIso(summary?.ended_at || summary?.endedAt || new Date().toISOString());
        this.endedAt = endedAt;
        if (summary?.status) {
          this.status = String(summary.status);
        } else if (!this.status) {
          this.status = 'completed';
        }
        await finishStage(this, 'search', endedAt, { reason: 'run_finalize' });
        await finishStage(this, 'fetch', endedAt, { reason: 'run_finalize' });
        await finishStage(this, 'parse', endedAt, { reason: 'run_finalize' });
        await finishStage(this, 'index', endedAt, { reason: 'run_finalize' });
        setStageCursor(this, String(summary?.stage_cursor || '').trim() || 'completed');
        await ensureBaselineArtifacts(this, endedAt);
        await writeRunMeta(this, {
          ...summary,
          status: this.status,
          ended_at: endedAt
        });
        // WHY: Serialize all run telemetry BEFORE maps/trackers are cleared.
        // run-summary.json captures events + LLM agg + observability for the GUI.
        // If caller already serialized (pipelineCommands passes runSummaryPayload),
        // reuse it to avoid a redundant SQL read of 6000+ events.
        try {
          const runSummaryPayload = summary.runSummaryPayload || await serializeRunSummary(this);
          await writeRunSummaryArtifact(this, runSummaryPayload);
          // WHY: bridge_events are now captured in run-summary.json. Purge the
          // per-run SQL rows to keep WAL lean. Product artifacts stay untouched.
          if (this.specDb) {
            try { this.specDb.purgeBridgeEventsForRun(this.runId); } catch { /* best-effort */ }
          }
        } catch { /* best-effort: pipeline continues without run-summary */ }
        this.fetchByUrl.clear();
        this.fetchClosedByUrl.clear();
        this.workerByUrl.clear();
        this._searchSlotScheduler.reset();
        this._llmTracker.reset();
      })
      .catch((err) => {
        this._observability.bridge_finalize_errors += 1;
        if (typeof console !== 'undefined') console.error('[IndexLabRuntimeBridge] finalize error:', err?.message || String(err));
      });
    await this.queue;
  }

  broadcastScreencastFrame(frame = {}) {
    if (!this.onEvent) return;
    const target = this.screencastTarget;
    if (target && target !== '*' && target !== String(frame.worker_id || '')) return;
    this.onEvent({
      __screencast: true,
      channel: `screencast-${frame.worker_id || ''}`,
      worker_id: String(frame.worker_id || ''),
      data: frame.data || '',
      width: frame.width || 0,
      height: frame.height || 0,
      ts: frame.ts || new Date().toISOString(),
    });
  }
}
