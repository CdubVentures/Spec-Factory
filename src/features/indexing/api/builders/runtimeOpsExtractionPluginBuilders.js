/**
 * Extraction-phase data builder for the Runtime Ops GUI.
 * Groups extraction_plugin_completed events by plugin name to produce
 * per-plugin telemetry for the Extraction stage group panels.
 *
 * WHY: Generic — the builder does not know what plugins exist.
 * It groups whatever events arrive by their `plugin` field and
 * spreads the raw `result` into each record. Adding a new extraction
 * plugin requires zero changes here. Mirrors runtimeOpsFetchBuilders.js.
 */

import { eventType, payloadOf, extractHost } from './runtimeOpsEventPrimitives.js';
import { buildWorkerDisplayLabelMap } from './runtimeOpsFetchAssignmentHelpers.js';

function buildEntry(payload, ts, workerLabels) {
  const url = String(payload.url || '');
  const workerId = String(payload.worker_id || '');
  const workerInfo = workerLabels[workerId];
  const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
  return {
    url,
    worker_id: workerId,
    display_label: workerInfo?.display_label || workerId,
    host: extractHost(url),
    ts: ts || '',
    ...result,
  };
}

export function buildExtractionPluginPhases(events) {
  const groups = {};
  const workerLabels = buildWorkerDisplayLabelMap(events);

  // WHY: Two-pass — extraction_artifacts_persisted can fire BEFORE its
  // matching extraction_plugin_completed (transform-phase plugins like
  // crawl4ai emit the persisted event inside onExtract before the runner
  // has wrapped the plugin's return into a completed event). Processing
  // in order would lose the filename/size join. Collect completed events
  // first (builds the entry index), then apply persisted events in pass 2.
  const persistedEvents = [];

  for (const event of events) {
    const type = eventType(event);

    if (type === 'extraction_plugin_completed') {
      const p = payloadOf(event);
      const pluginName = String(p.plugin || '').trim();
      if (!pluginName) continue;

      if (!groups[pluginName]) {
        groups[pluginName] = { entries: [], total: 0 };
      }

      groups[pluginName].entries.push(buildEntry(p, event.ts, workerLabels));
      groups[pluginName].total += 1;
    } else if (type === 'extraction_artifacts_persisted') {
      persistedEvents.push(event);
    }
  }

  // Pass 2: attach artifact filenames to their matching entries.
  // extraction_artifacts_persisted carries { plugin, url, worker_id, filenames, file_sizes }.
  for (const event of persistedEvents) {
    const p = payloadOf(event);
    const pluginName = String(p.plugin || '').trim();
    const url = String(p.url || '');
    const workerId = String(p.worker_id || '');
    const filenames = Array.isArray(p.filenames) ? p.filenames : [];
    const fileSizes = Array.isArray(p.file_sizes) ? p.file_sizes : [];

    if (pluginName && groups[pluginName] && filenames.length > 0) {
      const entry = groups[pluginName].entries.find(
        (e) => e.url === url && e.worker_id === workerId,
      );
      if (entry) {
        entry.filenames = filenames;
        if (fileSizes.length > 0) entry.file_sizes = fileSizes;
      }
    }
  }

  return groups;
}
