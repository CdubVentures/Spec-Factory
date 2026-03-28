import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { STORAGE_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveStorageCanonicalKeys, deriveStorageSecretPresenceMap } from '../../shared/settingsRegistryDerivations.js';

const STORAGE_CANONICAL_KEYS = deriveStorageCanonicalKeys(STORAGE_SETTINGS_REGISTRY);
const STORAGE_SECRET_PRESENCE_MAP = deriveStorageSecretPresenceMap(STORAGE_SETTINGS_REGISTRY);
const STORAGE_SECRET_KEY_SET = new Set(STORAGE_SECRET_PRESENCE_MAP.map((m) => m.sourceKey));

const DEFAULT_LOCAL_FOLDER_NAME = 'SpecFactoryRuns';
const DEFAULT_S3_PREFIX = 'spec-factory-runs';
const DEFAULT_S3_REGION = 'us-east-2';
const LOCAL_DESTINATION = 'local';
const S3_DESTINATION = 's3';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return fallback;
}

function toToken(value) {
  return String(value || '').trim();
}

function toPosix(value) {
  return toToken(value).replace(/\\/g, '/');
}

function normalizeDestinationType(value, fallback = LOCAL_DESTINATION) {
  const token = toToken(value).toLowerCase();
  if (token === LOCAL_DESTINATION || token === S3_DESTINATION) {
    return token;
  }
  return fallback;
}

export function defaultRunDataLocalDirectory() {
  const homeDir = toToken(os.homedir());
  if (!homeDir) return path.resolve(DEFAULT_LOCAL_FOLDER_NAME);
  return path.resolve(path.join(homeDir, 'Desktop', DEFAULT_LOCAL_FOLDER_NAME));
}

// WHY: Temp directories are volatile — they vanish on reboot. If a test or
// crash persists a temp-dir localDirectory, runs written there will disappear.
// Reject paths under os.tmpdir() so the stable default kicks in.
function isVolatilePath(dirPath) {
  if (!dirPath) return false;
  const resolved = path.resolve(dirPath);
  const tmpDir = path.resolve(os.tmpdir());
  return resolved.startsWith(tmpDir + path.sep) || resolved === tmpDir;
}

export function normalizeRunDataStorageSettings(input = {}, fallback = {}, options = {}) {
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const next = input && typeof input === 'object' ? input : {};
  const preserveExplicitVolatileLocalDirectory = options?.preserveExplicitVolatileLocalDirectory === true;
  const destinationType = normalizeDestinationType(
    Object.hasOwn(next, 'destinationType') ? next.destinationType : previous.destinationType,
    LOCAL_DESTINATION,
  );
  const hasExplicitLocalDirectory = Object.hasOwn(next, 'localDirectory');
  const rawLocalDirectory = toToken(
    hasExplicitLocalDirectory ? next.localDirectory : previous.localDirectory,
  );
  const localDirectoryToken = (
    (hasExplicitLocalDirectory && preserveExplicitVolatileLocalDirectory)
    || !isVolatilePath(rawLocalDirectory)
  )
    ? rawLocalDirectory
    : '';
  const localDirectory = destinationType === LOCAL_DESTINATION
    ? (localDirectoryToken || defaultRunDataLocalDirectory())
    : localDirectoryToken;
  return {
    enabled: toBool(
      Object.hasOwn(next, 'enabled') ? next.enabled : previous.enabled,
      false,
    ),
    destinationType,
    localDirectory,
    awsRegion: toToken(
      Object.hasOwn(next, 'awsRegion') ? next.awsRegion
        : Object.hasOwn(next, 's3Region') ? next.s3Region
        : Object.hasOwn(previous, 'awsRegion') ? previous.awsRegion
        : previous.s3Region,
    ) || DEFAULT_S3_REGION,
    s3Bucket: toToken(
      Object.hasOwn(next, 's3Bucket') ? next.s3Bucket : previous.s3Bucket,
    ),
    s3Prefix: toPosix(
      Object.hasOwn(next, 's3Prefix') ? next.s3Prefix : previous.s3Prefix,
    ).replace(/^\/+|\/+$/g, '') || DEFAULT_S3_PREFIX,
    s3AccessKeyId: toToken(
      Object.hasOwn(next, 's3AccessKeyId') ? next.s3AccessKeyId : previous.s3AccessKeyId,
    ),
    s3SecretAccessKey: toToken(
      Object.hasOwn(next, 's3SecretAccessKey') ? next.s3SecretAccessKey : previous.s3SecretAccessKey,
    ),
    s3SessionToken: toToken(
      Object.hasOwn(next, 's3SessionToken') ? next.s3SessionToken : previous.s3SessionToken,
    ),
    updatedAt: toToken(
      Object.hasOwn(next, 'updatedAt') ? next.updatedAt : previous.updatedAt,
    ) || null,
  };
}

export function sanitizeRunDataStorageSettingsForResponse(settings = {}) {
  const normalized = normalizeRunDataStorageSettings(
    settings,
    settings,
    { preserveExplicitVolatileLocalDirectory: true },
  );
  // WHY: Registry-driven — O(1) for new fields. Secrets become has* booleans.
  const response = {};
  for (const key of STORAGE_CANONICAL_KEYS) {
    if (STORAGE_SECRET_KEY_SET.has(key)) continue;
    response[key] = normalized[key];
  }
  for (const { sourceKey, responseKey } of STORAGE_SECRET_PRESENCE_MAP) {
    response[responseKey] = Boolean(normalized[sourceKey]);
  }
  response.stagingTempDirectory = path.resolve(os.tmpdir());
  return response;
}

export function validateRunDataStorageSettings(settings = {}) {
  const normalized = normalizeRunDataStorageSettings(
    settings,
    settings,
    { preserveExplicitVolatileLocalDirectory: true },
  );
  if (!normalized.enabled) return null;
  if (normalized.destinationType === LOCAL_DESTINATION) {
    if (!normalized.localDirectory) return 'local_directory_required';
    return null;
  }
  if (normalized.destinationType === S3_DESTINATION) {
    if (!normalized.awsRegion) return 's3_region_required';
    if (!normalized.s3Bucket) return 's3_bucket_required';
    if (!normalized.s3Prefix) return 's3_prefix_required';
    return null;
  }
  return 'invalid_destination_type';
}

export async function listLocalStorageDirectories({
  requestedPath = '',
  cwd = process.cwd(),
  maxEntries = 500,
} = {}) {
  const fallbackPath = path.resolve(String(cwd || process.cwd()));
  const currentPath = requestedPath
    ? path.resolve(String(requestedPath))
    : fallbackPath;
  const stat = await fs.stat(currentPath);
  if (!stat.isDirectory()) {
    throw new Error('path_is_not_directory');
  }
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(currentPath, entry.name);
      return {
        name: entry.name,
        path: fullPath,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Number(maxEntries || 500)));
  const parentPath = path.dirname(currentPath);
  return {
    currentPath,
    parentPath: parentPath !== currentPath ? parentPath : null,
    directories,
  };
}
