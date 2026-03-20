import fs from 'node:fs/promises';
import path from 'node:path';
import { loadProductCatalog } from '../../../catalog/products/productCatalog.js';
import { createPhaseDataReaders } from './phaseDataReaders.js';
import { createRunArtifactReaders } from './runArtifactReaders.js';
import { createEvidenceIndexReader } from './evidenceIndexReader.js';
import { createDomainChecklistBuilder } from './domainChecklistBuilder.js';
import { createAutomationQueueBuilder } from './automationQueueBuilder.js';
import { createRunListBuilder } from './runListBuilder.js';
import { toInt } from '../../../../shared/valueNormalizers.js';
import { safeJoin, safeReadJson, parseNdjson, readJsonlEvents, readGzipJsonlEvents } from '../../../../shared/fileHelpers.js';
export {
  clampAutomationPriority, automationPriorityForRequiredLevel, automationPriorityForJobType,
  toStringList, addUniqueStrings, buildAutomationJobId,
  normalizeAutomationStatus, normalizeAutomationQuery, buildSearchProfileQueryMaps,
} from './automationQueueHelpers.js';
import {
  initArchivedRunLocationHelpers,
  resolveArchivedIndexLabRunDirectory,
  refreshArchivedRunDirIndex,
  materializeArchivedRunLocation,
  readArchivedS3RunMetaOnly,
} from './archivedRunLocationHelpers.js';

let _resolveIndexLabRoot = () => '';
let _outputRoot = '';
let _storage = null;
let _config = null;
let _getSpecDbReady = null;
let _isProcessRunning = null;
let _processStatus = null;
let _phaseReaders = null;
let _artifactReaders = null;
let _evidenceReader = null;
let _domainChecklistBuilder = null;
let _automationQueueBuilder = null;
let _runListBuilder = null;

// WHY: Multiple subroutes (summary, workers, documents, prefetch) read the
// same event log for the same run in a single request cycle. A short TTL
// cache avoids redundant fs.readFile + parseNdjson work.
const EVENT_CACHE_TTL_MS = 5_000;
let _eventCache = new Map();

export async function resolveIndexLabRunDirectory(runId) {
  const token = String(runId || '').trim();
  if (!token) return '';
  const indexLabRoot = _resolveIndexLabRoot();
  const directRunDir = safeJoin(indexLabRoot, token);
  if (directRunDir) {
    const meta = await safeReadJson(path.join(directRunDir, 'run.json'));
    if (meta && typeof meta === 'object') {
      return directRunDir;
    }
  }
  try {
    const entries = await fs.readdir(indexLabRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidateToken = String(entry.name || '').trim();
      const candidateRunDir = safeJoin(indexLabRoot, candidateToken);
      if (!candidateToken || !candidateRunDir) continue;
      const meta = await safeReadJson(path.join(candidateRunDir, 'run.json'));
      if (!meta || typeof meta !== 'object') continue;
      if (String(meta.run_id || '').trim() === token) {
        return candidateRunDir;
      }
    }
  } catch {
    // ignore missing live run root
  }
  return resolveArchivedIndexLabRunDirectory(token);
}

export async function readIndexLabRunMeta(runId) {
  const runDir = await resolveIndexLabRunDirectory(runId);
  if (!runDir) return null;
  const meta = await safeReadJson(path.join(runDir, 'run.json'));
  return meta && typeof meta === 'object' ? meta : null;
}

function isRunStillActive(runId = '') {
  const token = String(runId || '').trim();
  if (!token) return false;

  if (typeof _processStatus === 'function') {
    try {
      const snapshot = _processStatus();
      if (!snapshot || snapshot.running !== true) return false;
      const activeRunId = String(snapshot.run_id || snapshot.runId || '').trim();
      return Boolean(activeRunId) && activeRunId === token;
    } catch {
      return false;
    }
  }

  if (typeof _isProcessRunning === 'function') {
    try {
      return _isProcessRunning() === true;
    } catch {
      return false;
    }
  }

  return false;
}

export function initIndexLabDataBuilders({
  indexLabRoot,
  outputRoot,
  storage,
  runDataArchiveStorage = null,
  config,
  getSpecDbReady,
  isProcessRunning,
  processStatus = null,
  runDataStorageState = null,
  getIndexLabRoot = null,
}) {
  _resolveIndexLabRoot = typeof getIndexLabRoot === 'function'
    ? getIndexLabRoot
    : () => indexLabRoot;
  _outputRoot = outputRoot;
  _storage = storage;
  _config = config;
  _eventCache = new Map();
  _getSpecDbReady = getSpecDbReady;
  _isProcessRunning = isProcessRunning;
  _processStatus = processStatus;
  initArchivedRunLocationHelpers({ outputRoot, runDataArchiveStorage, runDataStorageState });
  _phaseReaders = createPhaseDataReaders({
    resolveRunDir: resolveIndexLabRunDirectory,
    readMeta: readIndexLabRunMeta,
    readEvents: readIndexLabRunEvents,
    resolveProductId: resolveRunProductId,
    getStorage: () => _storage,
    readOutputRootJson,
  });
  _artifactReaders = createRunArtifactReaders({
    resolveRunDir: resolveIndexLabRunDirectory,
    readMeta: readIndexLabRunMeta,
    readEvents: readIndexLabRunEvents,
    resolveProductId: resolveRunProductId,
    resolveContext: resolveIndexLabRunContext,
    getStorage: () => _storage,
    readOutputRootJson,
    getOutputRoot: () => _outputRoot,
  });
  _evidenceReader = createEvidenceIndexReader({
    resolveContext: resolveIndexLabRunContext,
    readEvents: readIndexLabRunEvents,
    getSpecDbReady: _getSpecDbReady,
  });
  _domainChecklistBuilder = createDomainChecklistBuilder({
    readGzipJsonlEvents,
    readJsonlEvents,
    loadProductCatalog,
  });
  _automationQueueBuilder = createAutomationQueueBuilder({
    resolveContext: resolveIndexLabRunContext,
    readEvents: readIndexLabRunEvents,
    readNeedSet: readIndexLabRunNeedSet,
    readSearchProfile: readIndexLabRunSearchProfile,
  });
  _runListBuilder = createRunListBuilder({
    getIndexLabRoot: _resolveIndexLabRoot,
    isRunStillActive,
    readEvents: readIndexLabRunEvents,
    refreshArchivedRunDirIndex,
    materializeArchivedRunLocation,
    readArchivedS3RunMetaOnly,
  });
}

export async function readIndexLabRunEvents(runId, limit = 2000) {
  const effectiveLimit = Math.max(1, toInt(limit, 2000));
  const cacheKey = `${String(runId || '').trim()}:${effectiveLimit}`;
  const cached = _eventCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < EVENT_CACHE_TTL_MS) {
    return cached.rows;
  }

  const runDir = await resolveIndexLabRunDirectory(runId);
  if (!runDir) return [];
  const eventsPath = path.join(runDir, 'run_events.ndjson');
  let text = '';
  try {
    text = await fs.readFile(eventsPath, 'utf8');
  } catch {
    return [];
  }
  const rows = parseNdjson(text).slice(-effectiveLimit);
  _eventCache.set(cacheKey, { rows, at: Date.now() });
  return rows;
}

export function resolveRunProductId(meta = {}, events = []) {
  const fromMeta = String(meta?.product_id || '').trim();
  if (fromMeta) return fromMeta;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i] || {};
    const payload = row?.payload && typeof row.payload === 'object'
      ? row.payload
      : {};
    const candidate = String(
      row?.product_id
      || row?.productId
      || payload?.product_id
      || payload?.productId
      || ''
    ).trim();
    if (candidate) return candidate;
  }
  return '';
}

export async function readOutputRootJson(storageKey) {
  if (!_outputRoot || !storageKey) {
    return null;
  }
  const artifactPath = path.join(_outputRoot, ...String(storageKey).split('/'));
  return safeReadJson(artifactPath);
}

export async function resolveIndexLabRunContext(runId) {
  const token = String(runId || '').trim();
  if (!token) return null;
  const runDir = await resolveIndexLabRunDirectory(token);
  if (!runDir) return null;
  const meta = await readIndexLabRunMeta(token);
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const category = String(meta?.category || '').trim();
  const resolvedRunId = String(meta?.run_id || token).trim();
  if (!category || !resolvedRunId) {
    return null;
  }
  const eventRows = await readIndexLabRunEvents(token, 3000);
  const productId = resolveRunProductId(meta, eventRows);
  if (!productId) {
    return null;
  }
  return {
    token,
    runDir,
    meta,
    category,
    resolvedRunId,
    productId
  };
}

export async function readIndexLabRunNeedSet(runId) {
  return _artifactReaders.readIndexLabRunNeedSet(runId);
}

export async function readIndexLabRunSearchProfile(runId) {
  return _artifactReaders.readIndexLabRunSearchProfile(runId);
}

export async function readIndexLabRunPhase07Retrieval(runId) {
  return _phaseReaders.readIndexLabRunPhase07Retrieval(runId);
}

export async function readIndexLabRunPhase08Extraction(runId) {
  return _phaseReaders.readIndexLabRunPhase08Extraction(runId);
}

export async function readIndexLabRunDynamicFetchDashboard(runId) {
  return _phaseReaders.readIndexLabRunDynamicFetchDashboard(runId);
}

export async function readIndexLabRunSourceIndexingPackets(runId) {
  return _phaseReaders.readIndexLabRunSourceIndexingPackets(runId);
}

export async function readIndexLabRunItemIndexingPacket(runId) {
  return _artifactReaders.readIndexLabRunItemIndexingPacket(runId);
}

export async function readIndexLabRunRunMetaPacket(runId) {
  return _artifactReaders.readIndexLabRunRunMetaPacket(runId);
}

export async function readIndexLabRunSerpExplorer(runId) {
  return _artifactReaders.readIndexLabRunSerpExplorer(runId);
}

export async function readIndexLabRunLlmTraces(runId, limit = 80) {
  return _artifactReaders.readIndexLabRunLlmTraces(runId, limit);
}

export async function readIndexLabRunEvidenceIndex(runId, opts) {
  return _evidenceReader.readIndexLabRunEvidenceIndex(runId, opts);
}

export async function readIndexLabRunAutomationQueue(runId) {
  return _automationQueueBuilder.readIndexLabRunAutomationQueue(runId);
}

export async function listIndexLabRuns(opts) {
  return _runListBuilder.listIndexLabRuns(opts);
}

export async function buildIndexingDomainChecklist(opts) {
  return _domainChecklistBuilder.buildIndexingDomainChecklist(opts);
}
