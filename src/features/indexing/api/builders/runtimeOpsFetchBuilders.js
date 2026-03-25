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

function emptyAutoScrollData() {
  return {
    scroll_records: [],
    total_scrolled: 0,
    total_skipped: 0,
  };
}

function emptyDomExpansionData() {
  return {
    expansion_records: [],
    total_expanded: 0,
    total_skipped: 0,
    total_clicks: 0,
    total_found: 0,
  };
}

function emptyCssOverrideData() {
  return {
    override_records: [],
    total_overridden: 0,
    total_skipped: 0,
    total_elements_revealed: 0,
  };
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildFetchPhases(events) {
  const stealth = emptyStealthData();
  const autoScroll = emptyAutoScrollData();
  const domExpansion = emptyDomExpansionData();
  const cssOverride = emptyCssOverrideData();
  const workerLabels = buildWorkerDisplayLabelMap(events);

  for (const evt of events) {
    if (eventType(evt) !== 'plugin_hook_completed') continue;
    const p = payloadOf(evt);
    const result = p.result && typeof p.result === 'object' ? p.result : {};
    const workerId = String(p.worker_id || '');
    const workerInfo = workerLabels[workerId];
    const base = {
      worker_id: workerId,
      display_label: workerInfo?.display_label || workerId,
      url: workerInfo?.url || '',
      host: workerInfo?.host || '',
      ts: evt.ts || '',
    };

    if (p.plugin === 'stealth') {
      const injected = Boolean(result.injected);
      stealth.injections.push({ ...base, injected });
      if (injected) stealth.total_injected++;
      else stealth.total_failed++;
    }

    if (p.plugin === 'autoScroll') {
      const enabled = Boolean(result.enabled);
      const passes = Number(result.passes) || 0;
      autoScroll.scroll_records.push({
        ...base,
        enabled,
        passes,
        delayMs: Number(result.delayMs) || 0,
        postLoadWaitMs: Number(result.postLoadWaitMs) || 0,
      });
      if (enabled && passes > 0) autoScroll.total_scrolled++;
      else autoScroll.total_skipped++;
    }

    if (p.plugin === 'domExpansion') {
      const enabled = Boolean(result.enabled);
      const clickedCount = Number(result.clicked) || 0;
      const foundCount = Number(result.found) || 0;
      domExpansion.expansion_records.push({
        ...base,
        enabled,
        selectors: Array.isArray(result.selectors) ? result.selectors : [],
        found: foundCount,
        clicked: clickedCount,
        settleMs: Number(result.settleMs) || 0,
      });
      if (enabled && clickedCount > 0) domExpansion.total_expanded++;
      else domExpansion.total_skipped++;
      domExpansion.total_clicks += clickedCount;
      domExpansion.total_found += foundCount;
    }

    if (p.plugin === 'cssOverride') {
      const enabled = Boolean(result.enabled);
      const hiddenBefore = Number(result.hiddenBefore) || 0;
      const revealedAfter = Number(result.revealedAfter) || 0;
      cssOverride.override_records.push({
        ...base,
        enabled,
        hiddenBefore,
        revealedAfter,
      });
      if (enabled && hiddenBefore > 0) cssOverride.total_overridden++;
      else cssOverride.total_skipped++;
      cssOverride.total_elements_revealed += revealedAfter;
    }
  }

  return { stealth, auto_scroll: autoScroll, dom_expansion: domExpansion, css_override: cssOverride };
}
