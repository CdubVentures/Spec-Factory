// WHY: Phase cursor and stage start/finish lifecycle extracted from runtimeBridge.js
// Stateless functions receiving `state` (the bridge instance) as first argument.

import { toIso } from './runtimeBridgeCoercers.js';
import { emit, writeRunMeta } from './runtimeBridgeArtifacts.js';
import { PHASE_ORDER } from '../features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js';

export function setStageCursor(state, next = '') {
  const token = String(next || '').trim();
  if (!token || token === state.stageCursor) return false;
  const currentIdx = PHASE_ORDER.indexOf(state.stageCursor);
  const nextIdx = PHASE_ORDER.indexOf(token);
  if (currentIdx >= 0 && nextIdx >= 0 && nextIdx < currentIdx) return false;
  state.stageCursor = token;
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
  // WHY: fetch stage can fire during discovery (stage:fetch) or after discovery
  // completes (stage:crawl). If the cursor is already past domain-classifier, the backward
  // guard in setStageCursor would silently reject stage:fetch. Use stage:crawl
  // when discovery is complete so the stepper advances to the Crawl stage.
  const crawlIdx = PHASE_ORDER.indexOf('stage:crawl');
  const currentIdx = PHASE_ORDER.indexOf(state.stageCursor);
  const fetchPhase = stage === 'fetch' && currentIdx >= 0 && crawlIdx >= 0 && currentIdx >= crawlIdx - 1
    ? 'stage:crawl'
    : 'stage:fetch';
  const phaseByStage = {
    search: 'stage:search',
    fetch: fetchPhase,
    parse: 'stage:parse',
    index: 'stage:index'
  };
  const startupKey = startupKeyByStage[stage];
  if (startupKey) {
    recordStartupMs(state, startupKey, stageState.started_at);
  }
  const stageCursorUpdated = setStageCursor(state, phaseByStage[stage] || '');
  await emit(state, stage, `${stage}_started`, { scope: 'stage', ...payload }, stageState.started_at);
  if (startupKey || stageCursorUpdated) {
    await writeRunMeta(state);
  }
}

// WHY: startStage is idempotent — once fetch timing starts during search,
// crawl fetches can't re-trigger startStage. This standalone check advances
// to stage:crawl when the cursor is at or past domain-classifier.
export function advanceCrawlCursorIfReady(state) {
  const crawlIdx = PHASE_ORDER.indexOf('stage:crawl');
  const currentIdx = PHASE_ORDER.indexOf(state.stageCursor);
  if (currentIdx >= 0 && crawlIdx >= 0 && currentIdx >= crawlIdx - 1) {
    return setStageCursor(state, 'stage:crawl');
  }
  return false;
}

export async function finishStage(state, stage, ts = '', payload = {}) {
  const stageState = state.stageState[stage];
  if (!stageState || !stageState.started_at || stageState.ended_at) return;
  stageState.ended_at = toIso(ts || new Date().toISOString());
  await emit(state, stage, `${stage}_finished`, { scope: 'stage', ...payload }, stageState.ended_at);
}
