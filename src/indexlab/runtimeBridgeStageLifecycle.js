// WHY: Phase cursor and stage start/finish lifecycle extracted from runtimeBridge.js
// Stateless functions receiving `state` (the bridge instance) as first argument.

import { toIso } from './runtimeBridgeCoercers.js';
import { emit, writeRunMeta } from './runtimeBridgeArtifacts.js';

// WHY: Forward-only guard prevents late events (e.g. needset_computed during
// finalization) from regressing the cursor and making earlier tabs bounce.
const PHASE_ORDER = [
  'phase_00_bootstrap',
  'phase_01_needset',
  'phase_02_brand_resolver', 'phase_02_search',
  'phase_03_search_profile',
  'phase_04_search_planner',
  'phase_05_query_journey', 'phase_05_fetch',
  'phase_06_search_results', 'phase_06_parse', 'phase_06_index',
  'phase_07_serp_selector', 'phase_07_prime_sources',
  'phase_08_domain_classifier',
  'phase_09_crawl',
];

export function setPhaseCursor(state, next = '') {
  const token = String(next || '').trim();
  if (!token || token === state.phaseCursor) return false;
  const currentIdx = PHASE_ORDER.indexOf(state.phaseCursor);
  const nextIdx = PHASE_ORDER.indexOf(token);
  if (currentIdx >= 0 && nextIdx >= 0 && nextIdx < currentIdx) return false;
  state.phaseCursor = token;
  return true;
}

export function recordStartupMs(state, name, ts = '') {
  if (!Object.prototype.hasOwnProperty.call(state.startupMs, name)) {
    return false;
  }
  if (state.startupMs[name] !== null) {
    return false;
  }
  const startMs = Date.parse(String(state.startedAt || ''));
  const pointMs = Date.parse(String(ts || ''));
  if (!Number.isFinite(startMs) || !Number.isFinite(pointMs)) {
    return false;
  }
  state.startupMs[name] = Math.max(0, pointMs - startMs);
  return true;
}

export async function startStage(state, stage, ts = '', payload = {}) {
  const stageState = state.stageState[stage];
  if (!stageState || stageState.started_at) return;
  stageState.started_at = toIso(ts || new Date().toISOString());
  const startupKeyByStage = {
    search: 'search_started',
    fetch: 'fetch_started',
    parse: 'parse_started',
    index: 'index_started'
  };
  const phaseByStage = {
    search: 'phase_02_search',
    fetch: 'phase_05_fetch',
    parse: 'phase_06_parse',
    index: 'phase_06_index'
  };
  const startupKey = startupKeyByStage[stage];
  if (startupKey) {
    recordStartupMs(state, startupKey, stageState.started_at);
  }
  const phaseCursorUpdated = setPhaseCursor(state, phaseByStage[stage] || '');
  await emit(state, stage, `${stage}_started`, { scope: 'stage', ...payload }, stageState.started_at);
  if (startupKey || phaseCursorUpdated) {
    await writeRunMeta(state);
  }
}

export async function finishStage(state, stage, ts = '', payload = {}) {
  const stageState = state.stageState[stage];
  if (!stageState || !stageState.started_at || stageState.ended_at) return;
  stageState.ended_at = toIso(ts || new Date().toISOString());
  await emit(state, stage, `${stage}_finished`, { scope: 'stage', ...payload }, stageState.ended_at);
}
