// WHY: At run finalize, call each runtimeOps builder once against the events
// and return the pre-built panel data for embedding in run.json (v3).
// GUI serves old runs directly from this snapshot — zero re-aggregation.

import {
  buildRuntimeOpsSummary,
  buildRuntimeOpsDocuments,
  buildRuntimeOpsMetricsRail,
  buildPreFetchPhases,
  buildFetchPhases,
  buildRuntimeOpsWorkers,
  buildLlmCallsDashboard,
  buildFallbackEvents,
  buildQueueState,
  buildPipelineFlow,
} from './runtimeOpsDataBuilders.js';
import { buildExtractionPluginPhases } from './runtimeOpsExtractionPluginBuilders.js';

export const PANEL_KEYS = Object.freeze([
  'summary',
  'pipeline_flow',
  'metrics_rail',
  'documents',
  'prefetch',
  'fetch',
  'extraction_plugins',
  'workers',
  'llm_dashboard',
  'fallbacks',
  'queue',
]);

export function buildRuntimeOpsPanels({
  events: rawEvents,
  meta: rawMeta,
  artifacts: rawArtifacts,
  config,
  sourcePackets,
} = {}) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const artifacts = rawArtifacts && typeof rawArtifacts === 'object' ? rawArtifacts : {};

  const panels = {
    panel_version: 1,
    built_at: new Date().toISOString(),
  };

  try { panels.summary = buildRuntimeOpsSummary(events, meta); }
  catch { panels.summary = null; }

  try { panels.pipeline_flow = buildPipelineFlow(events); }
  catch { panels.pipeline_flow = null; }

  try { panels.metrics_rail = buildRuntimeOpsMetricsRail(events, meta); }
  catch { panels.metrics_rail = null; }

  try { panels.documents = buildRuntimeOpsDocuments(events, { limit: 500 }); }
  catch { panels.documents = null; }

  try { panels.prefetch = buildPreFetchPhases(events, meta, artifacts); }
  catch { panels.prefetch = null; }

  try { panels.fetch = buildFetchPhases(events); }
  catch { panels.fetch = null; }

  try { panels.extraction_plugins = buildExtractionPluginPhases(events); }
  catch { panels.extraction_plugins = null; }

  try {
    const workerOpts = {};
    if (sourcePackets) workerOpts.sourceIndexingPacketCollection = sourcePackets;
    if (config?.crawleeRequestHandlerTimeoutSecs) {
      workerOpts.crawleeRequestHandlerTimeoutSecs = config.crawleeRequestHandlerTimeoutSecs;
    }
    panels.workers = buildRuntimeOpsWorkers(events, workerOpts);
  }
  catch { panels.workers = null; }

  // WHY: Pass pre-built workers to avoid rebuilding the 484-line worker pool
  // a second time. buildLlmCallsDashboard previously called buildRuntimeOpsWorkers
  // internally, adding 4 redundant full passes over all events.
  try { panels.llm_dashboard = buildLlmCallsDashboard(events, { preBuiltWorkers: panels.workers }); }
  catch { panels.llm_dashboard = null; }

  try { panels.fallbacks = buildFallbackEvents(events, { limit: 500 }); }
  catch { panels.fallbacks = null; }

  try { panels.queue = buildQueueState(events, { limit: 500 }); }
  catch { panels.queue = null; }

  return panels;
}
