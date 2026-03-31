// WHY: Phase cursor and stage start/finish lifecycle extracted from runtimeBridge.js
// Stateless functions receiving `state` (the bridge instance) as first argument.

import { toIso } from './runtimeBridgeCoercers.js';
import { emit, writeRunMeta } from './runtimeBridgeArtifacts.js';
import { PHASE_ORDER } from '../features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js';

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
  // WHY: fetch stage can fire during discovery (phase_05_fetch) or after discovery
  // completes (phase_09_crawl). If the cursor is already past phase_08, the backward
  // guard in setPhaseCursor would silently reject phase_05_fetch. Use phase_09_crawl
  // when discovery is complete so the stepper advances to the Crawl stage.
  const crawlIdx = PHASE_ORDER.indexOf('phase_09_crawl');
  const currentIdx = PHASE_ORDER.indexOf(state.phaseCursor);
  const fetchPhase = stage === 'fetch' && currentIdx >= 0 && crawlIdx >= 0 && currentIdx >= crawlIdx - 1
    ? 'phase_09_crawl'
    : 'phase_05_fetch';
  const phaseByStage = {
    search: 'phase_02_search',
    fetch: fetchPhase,
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
