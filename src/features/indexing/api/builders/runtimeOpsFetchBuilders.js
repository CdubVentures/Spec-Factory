/**
 * Fetch-phase data builder for the Runtime Ops GUI.
 * Groups plugin_hook_completed events by plugin name to produce
 * per-plugin telemetry for the Fetch stage group panels.
 */

import { eventType, payloadOf } from './runtimeOpsEventPrimitives.js';
import { STEALTH_PATCHES } from '../../../crawl/plugins/stealthPlugin.js';
import { buildWorkerDisplayLabelMap } from './runtimeOpsFetchAssignmentHelpers.js';

// ── Baseline shapes ─────────────────────────────────────────────────────────

function emptyStealthData() {
  return {
    patches: [...STEALTH_PATCHES],
    injections: [],
    total_injected: 0,
    total_failed: 0,
  };
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildFetchPhases(events) {
  const stealth = emptyStealthData();
  const workerLabels = buildWorkerDisplayLabelMap(events);

  for (const evt of events) {
    if (eventType(evt) !== 'plugin_hook_completed') continue;
    const p = payloadOf(evt);
    if (p.plugin !== 'stealth') continue;

    const result = p.result && typeof p.result === 'object' ? p.result : {};
    const injected = Boolean(result.injected);
    const workerId = String(p.worker_id || '');
    const workerInfo = workerLabels[workerId];

    stealth.injections.push({
      worker_id: workerId,
      display_label: workerInfo?.display_label || workerId,
      url: workerInfo?.url || '',
      host: workerInfo?.host || '',
      injected,
      ts: evt.ts || '',
    });

    if (injected) stealth.total_injected++;
    else stealth.total_failed++;
  }

  return { stealth };
}
