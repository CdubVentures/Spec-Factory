import fs from 'node:fs/promises';
import path from 'node:path';
import { safeReadJson, safeStat } from '../../../../api/helpers/fileHelpers.js';

// --- Module state ---
let _outputRoot = '';
let _runDataArchiveStorage = null;
let _runDataStorageState = null;
let _archivedRunDirIndex = new Map();
let _archivedRunDirIndexRoot = '';
let _archivedRunDirIndexScannedAt = 0;
let _archivedRunMaterializationLocks = new Map();

const ARCHIVED_RUN_DIR_INDEX_TTL_MS = 2_000;

export function initArchivedRunLocationHelpers({ outputRoot, runDataArchiveStorage, runDataStorageState }) {
  _outputRoot = outputRoot;
  _runDataArchiveStorage = runDataArchiveStorage;
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
  const storage = _runDataArchiveStorage && typeof _runDataArchiveStorage.listKeys === 'function'
    ? _runDataArchiveStorage
    : null;
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

async function hydrateArchivedS3RunDirectory(location = {}, runId = '') {
  const keyBase = String(location?.keyBase || '').trim().replace(/\/+$/g, '');
  if (!keyBase) return '';
  const s3Settings = resolveArchivedS3Settings();
  if (!s3Settings) return '';
  const cacheRoot = buildArchivedS3CacheRoot(runId || location?.runId || '');
  const cacheIndexLabDir = path.join(cacheRoot, 'indexlab');
  const cacheMetaPath = path.join(cacheIndexLabDir, 'run.json');
  const cachedMeta = await safeReadJson(cacheMetaPath);
  if (cachedMeta && typeof cachedMeta === 'object') {
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
      if (!relativePath || relativePath.includes('..')) continue;
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
    if (force) {
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
