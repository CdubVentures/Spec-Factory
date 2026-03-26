/**
 * Fetch-phase data builder for the Runtime Ops GUI.
 * Groups plugin_hook_completed events by plugin name to produce
 * per-plugin telemetry for the Fetch stage group panels.
 *
 * WHY: Generic — the builder does not know what plugins exist.
 * It groups whatever events arrive by their `plugin` field and
 * spreads the raw `result` into each record. Adding a new fetch
 * plugin requires zero changes here.
 */

import { eventType, payloadOf } from './runtimeOpsEventPrimitives.js';
import { buildWorkerDisplayLabelMap } from './runtimeOpsFetchAssignmentHelpers.js';

// WHY: Plugin names are camelCase (autoScroll, domExpansion, etc.) but
// FetchPhasesResponse and selectProps use snake_case keys (auto_scroll, dom_expansion).
function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function buildFetchPhases(events) {
  const groups = {};
  const workerLabels = buildWorkerDisplayLabelMap(events);

  for (const evt of events) {
    if (eventType(evt) !== 'plugin_hook_completed') continue;

    const p = payloadOf(evt);
    const pluginName = String(p.plugin || '').trim();
    if (!pluginName) continue;

    const key = toSnakeCase(pluginName);
    const result = p.result && typeof p.result === 'object' ? p.result : {};
    const workerId = String(p.worker_id || '');
    const workerInfo = workerLabels[workerId];

    if (!groups[key]) {
      groups[key] = { records: [], total: 0 };
    }

    groups[key].records.push({
      worker_id: workerId,
      display_label: workerInfo?.display_label || workerId,
      url: workerInfo?.url || '',
      host: workerInfo?.host || '',
      ts: evt.ts || '',
      ...result,
    });
    groups[key].total += 1;
  }

  return groups;
}
