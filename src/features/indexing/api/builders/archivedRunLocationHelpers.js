import fs from 'node:fs/promises';
import path from 'node:path';
import { safeReadJson, safeStat } from '../../../../shared/fileHelpers.js';

// --- Module state ---
let _outputRoot = '';
let _runDataArchiveStorage = null;
let _getRunDataArchiveStorage = null;
let _runDataStorageState = null;
let _archivedRunDirIndex = new Map();
let _archivedRunDirIndexRoot = '';
let _archivedRunDirIndexScannedAt = 0;
let _archivedRunMaterializationLocks = new Map();

// WHY: Local scans are fast (filesystem readdir). S3 scans are slow (listKeys over 22k+ keys).
// Use a longer TTL so S3 scans don't fire every 2 seconds.
const ARCHIVED_RUN_DIR_INDEX_TTL_MS = 30_000;

export function initArchivedRunLocationHelpers({ outputRoot, runDataArchiveStorage, runDataStorageState, getRunDataArchiveStorage }) {
  _outputRoot = outputRoot;
  _runDataArchiveStorage = runDataArchiveStorage;
  _getRunDataArchiveStorage = typeof getRunDataArchiveStorage === 'function' ? getRunDataArchiveStorage : null;
  _runDataStorageState = runDataStorageState;
  resetArchivedRunDirIndex();
}

function resetArchivedRunDirIndex() {
  _archivedRunDirIndex = new Map();
  _archivedRunDirIndexRoot = '';
  _archivedRunDirIndexScannedAt = 0;
  _archivedRunMaterializationLocks = new Map();
}

export function resolveArchivedLocalRoot() {
  const settings = _runDataStorageState && typeof _runDataStorageState === 'object'
    ? _runDataStorageState
    : null;
  if (!settings || settings.enabled !== true) return '';
  if (String(settings.destinationType || '').trim().toLowerCase() !== 'local') return '';
  const localDirectory = String(settings.localDirectory || '').trim();
  if (!localDirectory) return '';
  return path.resolve(localDirectory);
}

export function resolveArchivedS3Settings() {
  const settings = _runDataStorageState && typeof _runDataStorageState === 'object'
    ? _runDataStorageState
    : null;
  if (!settings || settings.enabled !== true) return null;
  if (String(settings.destinationType || '').trim().toLowerCase() !== 's3') return null;
  const s3Prefix = String(settings.s3Prefix || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s3Prefix) return null;
  // WHY: The S3 client may be null if it was created at boot before S3 was configured.
  // Try the dynamic getter first to get a client created from live settings.
  let storage = _runDataArchiveStorage && typeof _runDataArchiveStorage.listKeys === 'function'
    ? _runDataArchiveStorage
    : null;
  if (!storage && _getRunDataArchiveStorage) {
    storage = _getRunDataArchiveStorage();
    if (storage && typeof storage.listKeys === 'function') {
      _runDataArchiveStorage = storage;
    } else {
      storage = null;
    }
  }
  if (!storage) return null;
  return { s3Prefix, storage };
}

export function buildArchivedRunIndexRootToken() {
  const localRoot = resolveArchivedLocalRoot();
  const s3Settings = resolveArchivedS3Settings();
  return [
    localRoot ? `local:${localRoot}` : '',
    s3Settings ? `s3:${s3Settings.s3Prefix}` : '',
  ].filter(Boolean).join('|');
}

export function buildArchivedS3CacheRoot(runId = '') {
  const safeRunId = String(runId || '').trim().replace(/[^A-Za-z0-9._-]+/g, '_') || 'run';
  const baseRoot = path.resolve(_outputRoot || '.');
  return path.join(baseRoot, '_runtime', 'archived_runs', 's3', safeRunId);
}

async function objectExists(storage, key) {
  if (!storage || !key) return false;
  try {
    if (typeof storage.objectExists === 'function') {
      return await storage.objectExists(key);
    }
    if (typeof storage.readTextOrNull === 'function') {
      return await storage.readTextOrNull(key) !== null;
    }
  } catch {
    return false;
  }
  return false;
}

async function enrichArchivedS3MetaWithArtifacts(parsed = null, { storage = null, keyBase = '' } = {}) {
  if (!parsed || typeof parsed !== 'object') return null;
  const normalizedKeyBase = String(keyBase || '').trim().replace(/\/+$/g, '');
  if (!normalizedKeyBase || !storage) return parsed;

  const existingArtifacts = parsed.artifacts && typeof parsed.artifacts === 'object'
    ? parsed.artifacts
    : {};
  const hasNeedset = Boolean(
    existingArtifacts.has_needset
    || parsed.needset
  );
  const hasSearchProfile = Boolean(
    existingArtifacts.has_search_profile
    || parsed.search_profile
  );
  const hasExplicitArtifactHints = Object.hasOwn(existingArtifacts, 'has_needset')
    || Object.hasOwn(existingArtifacts, 'has_search_profile');
  if (!hasExplicitArtifactHints && !hasNeedset && !hasSearchProfile) {
    return parsed;
  }

  return {
    ...parsed,
    artifacts: {
      ...existingArtifacts,
      has_needset: hasNeedset,
      has_search_profile: hasSearchProfile,
    },
  };
}

async function hydrateArchivedS3RunDirectory(location = {}, runId = '') {
  const keyBase = String(location?.keyBase || '').trim().replace(/\/+$/g, '');
  if (!keyBase) return '';
  const s3Settings = resolveArchivedS3Settings();
  if (!s3Settings) return '';
  const cacheRoot = buildArchivedS3CacheRoot(runId || location?.runId || '');
  const cacheIndexLabDir = path.join(cacheRoot, 'indexlab');
  const cacheMetaPath = path.join(cacheIndexLabDir, 'run.json');
  const cacheMaterializedMarkerPath = path.join(cacheRoot, '.materialized');
  const cachedMeta = await safeReadJson(cacheMetaPath);
  const cachedMaterialized = await safeStat(cacheMaterializedMarkerPath);
  if (cachedMeta && typeof cachedMeta === 'object' && cachedMaterialized) {
    return cacheIndexLabDir;
  }

  const lockKey = `${String(runId || location?.runId || '').trim()}:${keyBase}`;
  if (_archivedRunMaterializationLocks.has(lockKey)) {
    return _archivedRunMaterializationLocks.get(lockKey);
  }

  const hydratePromise = (async () => {
    const prefix = `${keyBase}/`;
    const keys = await s3Settings.storage.listKeys(prefix);
    if (!Array.isArray(keys) || keys.length === 0) return '';

    await fs.rm(cacheRoot, { recursive: true, force: true }).catch(() => {});

    for (const key of keys) {
      const token = String(key || '').trim().replace(/\\/g, '/');
      if (!token.startsWith(prefix)) continue;
      const relativePath = token.slice(prefix.length).replace(/^\/+/, '');
      if (!relativePath || relativePath.includes('../index.js')) continue;
      const destinationPath = path.join(cacheRoot, ...relativePath.split('/'));
      const resolvedDestinationPath = path.resolve(destinationPath);
      if (!resolvedDestinationPath.startsWith(path.resolve(cacheRoot))) continue;
      const buffer = typeof s3Settings.storage.readBuffer === 'function'
        ? await s3Settings.storage.readBuffer(token)
        : Buffer.from(String(await s3Settings.storage.readTextOrNull(token) || ''), 'utf8');
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.writeFile(destinationPath, buffer);
    }

    const meta = await safeReadJson(cacheMetaPath);
    if (meta && typeof meta === 'object') {
      await fs.writeFile(cacheMaterializedMarkerPath, 'ok\n', 'utf8');
    }
    return meta && typeof meta === 'object' ? cacheIndexLabDir : '';
  })().finally(() => {
    _archivedRunMaterializationLocks.delete(lockKey);
  });

  _archivedRunMaterializationLocks.set(lockKey, hydratePromise);
  return hydratePromise;
}

export async function materializeArchivedRunLocation(location = {}, runId = '') {
  if (!location || typeof location !== 'object') return '';
  if (location.type === 'local') {
    return String(location.runDir || '').trim();
  }
  if (location.type === 's3') {
    return hydrateArchivedS3RunDirectory(location, runId);
  }
  return '';
}

// WHY: Downloads ONLY run.json from S3 (single read, no listKeys).
// Used by the run-list builder so archived runs can appear in the picker
// without materializing the entire S3 run directory.
export async function readArchivedS3RunMetaOnly(location = {}, runId = '') {
  if (!location || typeof location !== 'object' || location.type !== 's3') return null;
  const keyBase = String(location.keyBase || '').trim().replace(/\/+$/g, '');
  if (!keyBase) return null;
  const s3Settings = resolveArchivedS3Settings();
  if (!s3Settings) return null;

  const cacheRoot = buildArchivedS3CacheRoot(runId || location.runId || '');
  const cacheIndexLabDir = path.join(cacheRoot, 'indexlab');
  const cacheMetaPath = path.join(cacheIndexLabDir, 'run.json');

  // Check local cache first — avoids S3 call if already materialized.
  const cachedMeta = await safeReadJson(cacheMetaPath);
  if (cachedMeta && typeof cachedMeta === 'object') {
    const enrichedCachedMeta = await enrichArchivedS3MetaWithArtifacts(cachedMeta, {
      storage: s3Settings.storage,
      keyBase,
    });
    if (enrichedCachedMeta && enrichedCachedMeta !== cachedMeta) {
      try {
        await fs.mkdir(cacheIndexLabDir, { recursive: true });
        await fs.writeFile(cacheMetaPath, JSON.stringify(enrichedCachedMeta), 'utf8');
      } catch {
        // Best-effort cache write.
      }
    }
    return enrichedCachedMeta;
  }

  // Single-file S3 read (no listKeys).
  const metaKey = `${keyBase}/indexlab/run.json`;
  let text = '';
  try {
    text = String(await s3Settings.storage.readTextOrNull(metaKey) || '');
  } catch {
    return null;
  }
  if (!text) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const enrichedParsed = await enrichArchivedS3MetaWithArtifacts(parsed, {
    storage: s3Settings.storage,
    keyBase,
  });

  // Cache locally so subsequent calls (and full hydration) short-circuit.
  try {
    await fs.mkdir(cacheIndexLabDir, { recursive: true });
    await fs.writeFile(cacheMetaPath, JSON.stringify(enrichedParsed), 'utf8');
  } catch {
    // Best-effort cache write.
  }

  return enrichedParsed;
}

async function addArchivedS3RunHints(nextIndex = new Map(), s3Settings = null) {
  if (!s3Settings) return;
  const runsRoot = path.join(path.resolve(_outputRoot || '.'), 'runs');
  let categoryEntries = [];
  try {
    categoryEntries = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) continue;
    const category = String(categoryEntry.name || '').trim();
    if (!category) continue;
    const categoryRoot = path.join(runsRoot, category);
    let productEntries = [];
    try {
      productEntries = await fs.readdir(categoryRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const productEntry of productEntries) {
      if (!productEntry.isDirectory()) continue;
      const productId = String(productEntry.name || '').trim();
      if (!productId) continue;
      const productRoot = path.join(categoryRoot, productId);
      let runEntries = [];
      try {
        runEntries = await fs.readdir(productRoot, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const runEntry of runEntries) {
        if (!runEntry.isDirectory()) continue;
        const runId = String(runEntry.name || '').trim();
        if (!runId || nextIndex.has(runId)) continue;
        const runRoot = path.join(productRoot, runId);
        const hasHint = Boolean(
          await safeStat(path.join(runRoot, 'summary.json'))
          || await safeStat(path.join(runRoot, 'spec.json'))
          || await safeStat(path.join(runRoot, 'provenance.json'))
        );
        if (!hasHint) continue;
        nextIndex.set(runId, {
          type: 's3',
          keyBase: `${s3Settings.s3Prefix}/${category}/${productId}/${runId}`,
          runId,
        });
      }
    }
  }
}

export async function refreshArchivedRunDirIndex(force = false) {
  const archiveRootToken = buildArchivedRunIndexRootToken();
  if (!archiveRootToken) {
    resetArchivedRunDirIndex();
    return _archivedRunDirIndex;
  }

  const nowMs = Date.now();
  if (
    !force
    && _archivedRunDirIndexRoot === archiveRootToken
    && (nowMs - _archivedRunDirIndexScannedAt) < ARCHIVED_RUN_DIR_INDEX_TTL_MS
  ) {
    return _archivedRunDirIndex;
  }

  const nextIndex = new Map();
  const archiveRoot = resolveArchivedLocalRoot();
  if (archiveRoot) {
    let categoryEntries = [];
    try {
      categoryEntries = await fs.readdir(archiveRoot, { withFileTypes: true });
    } catch {
      categoryEntries = [];
    }
    for (const categoryEntry of categoryEntries) {
      if (!categoryEntry.isDirectory()) continue;
      const categoryRoot = path.join(archiveRoot, categoryEntry.name);
      let productEntries = [];
      try {
        productEntries = await fs.readdir(categoryRoot, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const productEntry of productEntries) {
        if (!productEntry.isDirectory()) continue;
        const productRoot = path.join(categoryRoot, productEntry.name);
        let runEntries = [];
        try {
          runEntries = await fs.readdir(productRoot, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const runEntry of runEntries) {
          if (!runEntry.isDirectory()) continue;
          const runDir = path.join(productRoot, runEntry.name, 'indexlab');
          const meta = await safeReadJson(path.join(runDir, 'run.json'));
          if (!meta || typeof meta !== 'object') continue;
          const runId = String(meta?.run_id || runEntry.name).trim();
          if (!runId || nextIndex.has(runId)) continue;
          nextIndex.set(runId, { type: 'local', runDir });
        }
      }
    }
  }

  const s3Settings = resolveArchivedS3Settings();
  if (s3Settings) {
    await addArchivedS3RunHints(nextIndex, s3Settings);
    // WHY: Always do the full S3 key listing when the TTL cache expires.
    // The TTL (2s) prevents redundant scans. The addArchivedS3RunHints above
    // only checks local filesystem hints which is insufficient for S3-only runs.
    {
      let keys = [];
      try {
        keys = await s3Settings.storage.listKeys(s3Settings.s3Prefix);
      } catch {
        keys = [];
      }
      const prefixBase = `${s3Settings.s3Prefix}/`;
      for (const key of keys) {
        const token = String(key || '').trim().replace(/\\/g, '/');
        if (!token.endsWith('/indexlab/run.json')) continue;
        const relativePath = token.startsWith(prefixBase)
          ? token.slice(prefixBase.length)
          : token;
        const parts = relativePath.split('/').filter(Boolean);
        if (parts.length < 5) continue;
        const [category, productId, runId, indexlabToken, fileName] = parts;
        if (indexlabToken !== 'indexlab' || fileName !== 'run.json') continue;
        if (!runId || nextIndex.has(runId)) continue;
        nextIndex.set(runId, {
          type: 's3',
          keyBase: `${s3Settings.s3Prefix}/${category}/${productId}/${runId}`,
          runId,
        });
      }
    }
  }

  _archivedRunDirIndex = nextIndex;
  _archivedRunDirIndexRoot = archiveRootToken;
  _archivedRunDirIndexScannedAt = nowMs;
  return _archivedRunDirIndex;
}

export async function resolveArchivedIndexLabRunDirectory(runId) {
  const token = String(runId || '').trim();
  if (!token) return '';
  const index = await refreshArchivedRunDirIndex(false);
  if (index.has(token)) {
    return materializeArchivedRunLocation(index.get(token), token);
  }
  const refreshed = await refreshArchivedRunDirIndex(true);
  return materializeArchivedRunLocation(refreshed.get(token), token);
}
