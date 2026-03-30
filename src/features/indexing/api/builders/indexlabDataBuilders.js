import fs from 'node:fs/promises';
import path from 'node:path';
import { loadProductCatalog } from '../../../catalog/index.js';
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
    try {
      const stat = await fs.stat(directRunDir);
      if (stat.isDirectory()) return directRunDir;
    } catch { /* directory doesn't exist */ }
  }
  // WHY: Directory name may differ from canonical run_id (e.g. live-watch alias).
  // Lightweight scan of live indexLabRoot to match by run.json metadata.
  try {
    const entries = await fs.readdir(indexLabRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidateDir = safeJoin(indexLabRoot, entry.name);
      if (!candidateDir) continue;
      const meta = await safeReadJson(path.join(candidateDir, 'run.json'));
      if (meta && String(meta.run_id || '').trim() === token) return candidateDir;
    }
  } catch { /* indexLabRoot doesn't exist or unreadable */ }
  return '';
}

export async function readIndexLabRunMeta(runId) {
  const token = String(runId || '').trim();
  if (!token) return null;

  // Tier 1: SQL lookup (primary path post Wave 5.5)
  if (typeof _getSpecDbReady === 'function') {
    // 1a: Active process — get category directly from process status
    if (typeof _processStatus === 'function') {
      try {
        const snap = _processStatus();
        const cat = String(snap?.category || '').trim();
        if (cat) {
          const specDb = await _getSpecDbReady(cat);
          if (specDb) {
            const row = specDb.getRunByRunId(token);
            if (row) return row;
          }
        }
      } catch { /* best-effort */ }
    }
    // 1b: Scan specDb directory for category databases
    const scanDirs = [
      _config?.specDbDir,
      _resolveIndexLabRoot(),
    ].filter(Boolean);
    for (const scanDir of scanDirs) {
      try {
        const entries = await fs.readdir(scanDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const name = entry.name;
          if (/^\d/.test(name) || name.startsWith('.') || name.startsWith('_')) continue;
          try {
            const specDb = await _getSpecDbReady(name);
            if (specDb) {
              const row = specDb.getRunByRunId(token);
              if (row) return row;
            }
          } catch { continue; }
        }
      } catch { continue; }
    }
  }

  // Tier 2: run-summary.json (file fallback for pre-migration runs)
  const runDir = await resolveIndexLabRunDirectory(token);
  if (runDir) {
    const { extractMetaFromRunSummary } = await import('../../../../indexlab/runSummarySerializer.js');
    const summary = await safeReadJson(path.join(runDir, 'run-summary.json'));
    if (summary) {
      const meta = extractMetaFromRunSummary(summary);
      if (meta) return meta;
    }
  }

  // Tier 3: run.json (legacy pre-migration runs)
  if (runDir) {
    const meta = await safeReadJson(path.join(runDir, 'run.json'));
    if (meta && typeof meta === 'object') return meta;
  }

  return null;
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
  getRunDataArchiveStorage = null,
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
    getSpecDbReady: _getSpecDbReady,
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
    getSpecDbReady: _getSpecDbReady,
  });
}

export async function readIndexLabRunEvents(runId, limit = 2000, { category } = {}) {
  const effectiveLimit = Math.max(1, toInt(limit, 2000));
  const cacheKey = `${String(runId || '').trim()}:${effectiveLimit}`;
  const cached = _eventCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < EVENT_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (!category || typeof _getSpecDbReady !== 'function') return [];
  const specDb = await _getSpecDbReady(category);
  if (!specDb) return [];
  const rows = specDb.getBridgeEventsByRunId(String(runId || '').trim(), effectiveLimit);
  _eventCache.set(cacheKey, { rows, at: Date.now() });
  return rows;
}

// WHY: Wave 5.5 — read events from run-summary.json (written at finalize)
// instead of querying bridge_events SQL on every GUI page load.
// 3-tier fallback: SQL artifact → file → bridge_events SQL (existing path).
export async function readRunSummaryEvents(runId, limit = 2000, { category } = {}) {
  const { extractEventsFromRunSummary } = await import('../../../../indexlab/runSummarySerializer.js');
  const token = String(runId || '').trim();
  if (!token) return [];

  // Tier 1: SQL run_artifacts with artifact_type='run_summary'
  if (category && typeof _getSpecDbReady === 'function') {
    try {
      const specDb = await _getSpecDbReady(category);
      if (specDb) {
        const artifact = specDb.getRunArtifact(token, 'run_summary');
        if (artifact?.payload) {
          const events = extractEventsFromRunSummary(artifact.payload);
          if (events.length > 0) return events.slice(0, limit);
        }
      }
    } catch { /* fall through */ }
  }

  // Tier 2: run-summary.json file on disk
  try {
    const runDir = await resolveIndexLabRunDirectory(token);
    if (runDir) {
      const summary = await safeReadJson(path.join(runDir, 'run-summary.json'));
      if (summary) {
        const events = extractEventsFromRunSummary(summary);
        if (events.length > 0) return events.slice(0, limit);
      }
    }
  } catch { /* fall through */ }

  // Tier 3: bridge_events SQL (existing path — for pre-migration runs)
  return readIndexLabRunEvents(runId, limit, { category });
}

export function invalidateEventCache(runId) {
  const token = String(runId || '').trim();
  if (!token) { _eventCache.clear(); return; }
  for (const key of _eventCache.keys()) {
    if (key.startsWith(`${token}:`)) _eventCache.delete(key);
  }
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
  const meta = await readIndexLabRunMeta(token);
  if (!meta || typeof meta !== 'object') return null;
  const runDir = await resolveIndexLabRunDirectory(token);
  const category = String(meta?.category || '').trim();
  const resolvedRunId = String(meta?.run_id || token).trim();
  if (!category || !resolvedRunId) {
    return null;
  }
  const eventRows = await readIndexLabRunEvents(token, 3000, { category });
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
  // WHY: Thread catalog brand/model/variant into label builder so hex IDs display real names.
  if (opts?.category && !opts.catalogProducts && _config) {
    try {
      const catalog = await loadProductCatalog(_config, opts.category);
      const map = new Map();
      for (const [pid, entry] of Object.entries(catalog.products || {})) {
        map.set(pid, { brand: entry.brand || '', model: entry.model || '', variant: entry.variant || '' });
      }
      return _runListBuilder.listIndexLabRuns({ ...opts, catalogProducts: map });
    } catch { /* fall through to no-catalog path */ }
  }
  return _runListBuilder.listIndexLabRuns(opts);
}

export async function buildIndexingDomainChecklist(opts) {
  const cat = String(opts.category || '').trim();
  const specDb = cat && typeof _getSpecDbReady === 'function'
    ? await _getSpecDbReady(cat).catch(() => null)
    : null;
  return _domainChecklistBuilder.buildIndexingDomainChecklist({ ...opts, specDb });
}
