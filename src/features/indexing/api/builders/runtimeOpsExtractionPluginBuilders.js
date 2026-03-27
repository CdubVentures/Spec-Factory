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
    }

    // WHY: Merge artifact filenames emitted after persistence into matching entries.
    // extraction_artifacts_persisted carries { plugin, url, worker_id, filenames }.
    if (type === 'extraction_artifacts_persisted') {
      const p = payloadOf(event);
      const pluginName = String(p.plugin || '').trim();
      const url = String(p.url || '');
      const workerId = String(p.worker_id || '');
      const filenames = Array.isArray(p.filenames) ? p.filenames : [];

      if (pluginName && groups[pluginName] && filenames.length > 0) {
        const entry = groups[pluginName].entries.find(
          (e) => e.url === url && e.worker_id === workerId,
        );
        if (entry) {
          entry.filenames = filenames;
        }
      }
    }
  }

  return groups;
}
