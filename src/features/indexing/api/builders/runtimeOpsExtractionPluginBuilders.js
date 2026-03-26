/**
 * Extraction-phase data builder for the Runtime Ops GUI.
 * Groups extraction_plugin_completed events by plugin name to produce
 * per-plugin telemetry for the Extraction stage group panels.
 *
 * WHY: Generic — the builder does not know what plugins exist.
 * It groups whatever events arrive by their `plugin` field.
 * Adding a new extraction plugin requires zero changes here.
 */

import { eventType, payloadOf } from './runtimeOpsEventPrimitives.js';

function buildEntry(payload) {
  return {
    url: String(payload.url || ''),
    worker_id: String(payload.worker_id || ''),
  };
}

export function buildExtractionPluginPhases(events) {
  const groups = {};

  for (const event of events) {
    if (eventType(event) !== 'extraction_plugin_completed') continue;

    const p = payloadOf(event);
    const pluginName = String(p.plugin || '').trim();
    if (!pluginName) continue;

    if (!groups[pluginName]) {
      groups[pluginName] = { entries: [], total: 0 };
    }

    groups[pluginName].entries.push(buildEntry(p));
    groups[pluginName].total += 1;
  }

  return groups;
}
