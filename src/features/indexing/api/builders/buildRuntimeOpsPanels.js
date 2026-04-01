// WHY: Single-pass event processing engine replaces 15+ separate for-loops.
// Summary, pipeline_flow, metrics_rail, documents, fallbacks, queue are
// processed in one pass via the engine's routing table. Complex builders
// (workers, prefetch, fetch, extraction) still run standalone for now.
// Adding a panel = one registry entry in eventProcessingEngine.js.

import { processEventsToPanel } from './eventProcessingEngine.js';

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
  return processEventsToPanel({
    events: rawEvents,
    meta: rawMeta,
    artifacts: rawArtifacts,
    config,
    sourcePackets,
  });
}
