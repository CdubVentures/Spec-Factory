import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { defaultIndexLabRoot, defaultLocalOutputRoot } from '../../core/config/runtimeArtifactRoots.js';
import { computeRunStorageMetrics } from './storageMetricsService.js';
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

function isSubPath(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sanitizePathToken(value, fallback = 'value') {
  const token = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || fallback;
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

function resolveRunToken(runMeta, keys) {
  if (!runMeta || typeof runMeta !== 'object') return '';
  for (const key of keys) {
    const value = toToken(runMeta[key]);
    if (value) return value;
  }
  return '';
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectoryIfPresent(sourceDir, destinationDir) {
  if (!(await pathExists(sourceDir))) return false;
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await fs.cp(sourceDir, destinationDir, { recursive: true, force: true });
  return true;
}

async function deleteDirectoryIfPresent(sourceDir) {
  if (!(await pathExists(sourceDir))) return false;
  await fs.rm(sourceDir, { recursive: true, force: true });
  return true;
}

async function collectFilesRecursive(rootDir) {
  const output = [];
  const walk = async (dir) => {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      output.push(absolutePath);
    }
  };
  await walk(rootDir);
  return output.sort();
}

function readRunIdFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  return toToken(
    row.runId
    || row.run_id
    || row?.meta?.run_id
    || row?.meta?.runId
    || row?.context?.runId
    || row?.context?.run_id,
  );
}

function splitJsonlLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function partitionJsonlLinesByRunId(lines = [], runId = '') {
  const runRows = [];
  const keptRows = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (readRunIdFromRow(parsed) === runId) {
        runRows.push(line);
        continue;
      }
    } catch {}
    keptRows.push(line);
  }
  return { runRows, keptRows };
}

async function filterJsonlByRunId(sourcePath, runId) {
  if (!(await pathExists(sourcePath))) {
    return [];
  }
  const text = await fs.readFile(sourcePath, 'utf8');
  const { runRows } = partitionJsonlLinesByRunId(splitJsonlLines(text), runId);
  return runRows;
}

async function pruneJsonlByRunId(sourcePath, runId) {
  if (!(await pathExists(sourcePath))) return 0;
  const text = await fs.readFile(sourcePath, 'utf8');
  const { runRows, keptRows } = partitionJsonlLinesByRunId(splitJsonlLines(text), runId);
  if (runRows.length === 0) return 0;
  const nextText = keptRows.length > 0 ? `${keptRows.join('\n')}\n` : '';
  await fs.writeFile(sourcePath, nextText, 'utf8');
  return runRows.length;
}

function resolveOutputPathFromKey(outputRoot, key) {
  const token = toPosix(key);
  if (!token) return '';
  const parts = token.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  return path.resolve(path.join(outputRoot, ...parts));
}

function resolveRuntimeEventsCandidates(outputRoot, outputPrefix) {
  const prefixParts = toPosix(outputPrefix).split('/').filter(Boolean);
  const candidates = [
    path.resolve(path.join(outputRoot, '_runtime', 'events.jsonl')),
    path.resolve(path.join(outputRoot, ...prefixParts, '_runtime', 'events.jsonl')),
  ];
  return [...new Set(candidates)];
}

function resolveRuntimeTraceRunCandidates(outputRoot, outputPrefix, runId) {
  const prefixParts = toPosix(outputPrefix).split('/').filter(Boolean);
  const candidates = [
    path.resolve(path.join(outputRoot, ...prefixParts, '_runtime', 'traces', 'runs', runId)),
    path.resolve(path.join(outputRoot, '_runtime', 'traces', 'runs', runId)),
  ];
  return [...new Set(candidates)];
}

async function resolveBillingLedgerCandidates(outputRoot, outputPrefix) {
  const prefixParts = toPosix(outputPrefix).split('/').filter(Boolean);
  const roots = [
    path.resolve(path.join(outputRoot, '_billing')),
    path.resolve(path.join(outputRoot, ...prefixParts, '_billing')),
  ];
  const candidates = [];
  for (const rootDir of roots) {
    if (!(await pathExists(rootDir))) continue;
    const flatLedger = path.join(rootDir, 'ledger.jsonl');
    if (await pathExists(flatLedger)) {
      candidates.push(flatLedger);
    }
    const monthlyLedgerDir = path.join(rootDir, 'ledger');
    if (!(await pathExists(monthlyLedgerDir))) continue;
    const monthlyFiles = (await collectFilesRecursive(monthlyLedgerDir))
      .filter((filePath) => filePath.toLowerCase().endsWith('.jsonl'));
    candidates.push(...monthlyFiles);
  }
  return [...new Set(candidates)].sort();
}

function toS3Credentials(settings) {
  const accessKeyId = toToken(settings.s3AccessKeyId);
  const secretAccessKey = toToken(settings.s3SecretAccessKey);
  if (!accessKeyId || !secretAccessKey) return undefined;
  const sessionToken = toToken(settings.s3SessionToken);
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

async function uploadDirectoryToS3({ rootDir, region, bucket, prefix, credentials }) {
  const files = await collectFilesRecursive(rootDir);
  const client = new S3Client({
    region,
    ...(credentials ? { credentials } : {}),
  });
  let uploadedFiles = 0;
  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath).split(path.sep).join('/');
    const key = [toPosix(prefix).replace(/\/+$/g, ''), relative]
      .filter(Boolean)
      .join('/');
    const body = await fs.readFile(filePath);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    }));
    uploadedFiles += 1;
  }
  return {
    uploadedFiles,
    uploadedPrefix: toPosix(prefix).replace(/\/+$/g, ''),
  };
}

async function purgeSharedJsonlSources({
  runId = '',
  runtimeEventsSourcePath = '',
  billingLedgerPaths = [],
} = {}) {
  const runtimeRowsRemoved = runtimeEventsSourcePath
    ? await pruneJsonlByRunId(runtimeEventsSourcePath, runId)
    : 0;
  let billingRowsRemoved = 0;
  for (const ledgerPath of billingLedgerPaths) {
    billingRowsRemoved += await pruneJsonlByRunId(ledgerPath, runId);
  }
  return {
    runtimeRowsRemoved,
    billingRowsRemoved,
  };
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

export function shouldRelocateRunData(settings = {}) {
  const normalized = normalizeRunDataStorageSettings(
    settings,
    settings,
    { preserveExplicitVolatileLocalDirectory: true },
  );
  if (!normalized.enabled) return false;
  if (normalized.destinationType === LOCAL_DESTINATION) {
    return Boolean(normalized.localDirectory);
  }
  if (normalized.destinationType === S3_DESTINATION) {
    return Boolean(normalized.awsRegion && normalized.s3Bucket && normalized.s3Prefix);
  }
  return false;
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

export async function relocateRunDataForCompletedRun({
  settings = {},
  runMeta = {},
  outputRoot = defaultLocalOutputRoot(),
  outputPrefix = 'specs/outputs',
  indexLabRoot = defaultIndexLabRoot(),
} = {}) {
  const normalizedSettings = normalizeRunDataStorageSettings(
    settings,
    settings,
    { preserveExplicitVolatileLocalDirectory: true },
  );
  const validationError = validateRunDataStorageSettings(normalizedSettings);
  if (validationError) {
    throw new Error(validationError);
  }
  if (!shouldRelocateRunData(normalizedSettings)) {
    return {
      ok: false,
      skipped: 'storage_not_enabled',
    };
  }

  const runId = resolveRunToken(runMeta, ['run_id', 'runId']);
  const category = resolveRunToken(runMeta, ['category']) || 'unknown-category';
  const productId = resolveRunToken(runMeta, ['product_id', 'productId']) || 'unknown-product';
  const runBaseKey = resolveRunToken(runMeta, ['run_base', 'runBase']);
  const latestBaseKey = resolveRunToken(runMeta, ['latest_base', 'latestBase']);
  if (!runId) {
    throw new Error('missing_run_id');
  }

  const outputRootAbs = path.resolve(String(outputRoot || defaultLocalOutputRoot()));
  const indexLabRootAbs = path.resolve(String(indexLabRoot || defaultIndexLabRoot()));

  const runOutputDir = resolveOutputPathFromKey(outputRootAbs, runBaseKey);
  const latestOutputDir = resolveOutputPathFromKey(outputRootAbs, latestBaseKey);
  const indexLabRunDir = path.resolve(path.join(indexLabRootAbs, runId));
  const runtimeTraceRunDir = (await (async () => {
    const candidates = resolveRuntimeTraceRunCandidates(outputRootAbs, outputPrefix, runId);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return candidate;
    }
    return '';
  })());
  const runtimeEventsSourcePath = (await (async () => {
    const candidates = resolveRuntimeEventsCandidates(outputRootAbs, outputPrefix);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return candidate;
    }
    return '';
  })());
  const billingLedgerPaths = await resolveBillingLedgerCandidates(outputRootAbs, outputPrefix);

  const runOutputInsideRoot = runOutputDir && isSubPath(outputRootAbs, runOutputDir);
  const latestOutputInsideRoot = latestOutputDir && isSubPath(outputRootAbs, latestOutputDir);
  const indexLabInsideRoot = indexLabRunDir && isSubPath(indexLabRootAbs, indexLabRunDir);
  if (runOutputDir && !runOutputInsideRoot) throw new Error('run_output_outside_root');
  if (latestOutputDir && !latestOutputInsideRoot) throw new Error('latest_output_outside_root');
  if (indexLabRunDir && !indexLabInsideRoot) throw new Error('indexlab_output_outside_root');

  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-run-stage-'));
  const stageRunRoot = path.join(stageRoot, 'bundle');
  try {
    await fs.mkdir(stageRunRoot, { recursive: true });

  const copyReport = {
    staged_run_output: false,
    staged_latest_snapshot: false,
    staged_indexlab: false,
    staged_runtime_traces: false,
    runtime_event_rows: 0,
    billing_rows: 0,
    billing_files: 0,
    purged_runtime_event_rows: 0,
    purged_billing_rows: 0,
  };

  if (runOutputDir) {
    copyReport.staged_run_output = await copyDirectoryIfPresent(runOutputDir, path.join(stageRunRoot, 'run_output'));
  }
  if (latestOutputDir) {
    copyReport.staged_latest_snapshot = await copyDirectoryIfPresent(latestOutputDir, path.join(stageRunRoot, 'latest_snapshot'));
  }
  if (indexLabRunDir) {
    copyReport.staged_indexlab = await copyDirectoryIfPresent(indexLabRunDir, path.join(stageRunRoot, 'indexlab'));
  }
  if (runtimeTraceRunDir) {
    copyReport.staged_runtime_traces = await copyDirectoryIfPresent(runtimeTraceRunDir, path.join(stageRunRoot, 'runtime_traces'));
  }

  const sharedLogsDir = path.join(stageRunRoot, 'shared_logs');
  await fs.mkdir(sharedLogsDir, { recursive: true });

  if (runtimeEventsSourcePath) {
    const runtimeRows = await filterJsonlByRunId(runtimeEventsSourcePath, runId);
    copyReport.runtime_event_rows = runtimeRows.length;
    if (runtimeRows.length > 0) {
      await fs.writeFile(
        path.join(sharedLogsDir, 'runtime_events.jsonl'),
        `${runtimeRows.join('\n')}\n`,
        'utf8',
      );
    }
  }

  for (const ledgerPath of billingLedgerPaths) {
    const rows = await filterJsonlByRunId(ledgerPath, runId);
    if (rows.length === 0) continue;
    const basename = path.basename(ledgerPath).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const parentToken = sanitizePathToken(path.basename(path.dirname(ledgerPath)), 'billing');
    const outputName = parentToken === 'ledger'
      ? `billing_ledger_${basename}`
      : `billing_${parentToken}_${basename}`;
    await fs.writeFile(path.join(sharedLogsDir, outputName), `${rows.join('\n')}\n`, 'utf8');
    copyReport.billing_rows += rows.length;
    copyReport.billing_files += 1;
  }

  const manifest = {
    run_id: runId,
    category,
    product_id: productId,
    source: {
      run_base: runBaseKey || null,
      latest_base: latestBaseKey || null,
      output_root: outputRootAbs,
      indexlab_root: indexLabRootAbs,
    },
    staged: copyReport,
    generated_at: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(stageRunRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  // WHY: Compute storage_metrics while all artifacts are staged in one place.
  // The run is done; sizes won't change. Enrich run.json before final copy/upload.
  try {
    const storageMetrics = await computeRunStorageMetrics(stageRunRoot);
    const stagedRunJsonPath = path.join(stageRunRoot, 'indexlab', 'run.json');
    let runMeta;
    try {
      runMeta = JSON.parse(await fs.readFile(stagedRunJsonPath, 'utf8'));
    } catch {
      runMeta = null;
    }
    if (runMeta && typeof runMeta === 'object') {
      runMeta.storage_metrics = storageMetrics;
      await fs.writeFile(stagedRunJsonPath, `${JSON.stringify(runMeta, null, 2)}\n`, 'utf8');
    }
  } catch (metricsErr) {
    // Non-fatal: don't block relocation on metrics failure
    process.stderr.write(`[storage-metrics] Warning: failed to compute storage_metrics for run ${runId}: ${String(metricsErr?.message || metricsErr)}\n`);
  }

  const sourceDirsToDelete = [...new Set([
    copyReport.staged_run_output ? runOutputDir : '',
    copyReport.staged_latest_snapshot ? latestOutputDir : '',
    copyReport.staged_indexlab ? indexLabRunDir : '',
    copyReport.staged_runtime_traces ? runtimeTraceRunDir : '',
  ].filter(Boolean))];

  if (normalizedSettings.destinationType === LOCAL_DESTINATION) {
    const destinationRoot = path.resolve(
      normalizedSettings.localDirectory,
      category,
      productId,
      runId,
    );
    await fs.mkdir(path.dirname(destinationRoot), { recursive: true });
    await fs.rm(destinationRoot, { recursive: true, force: true });
    await fs.cp(stageRunRoot, destinationRoot, { recursive: true, force: true });
    const purgeReport = await purgeSharedJsonlSources({
      runId,
      runtimeEventsSourcePath,
      billingLedgerPaths,
    });
    copyReport.purged_runtime_event_rows = purgeReport.runtimeRowsRemoved;
    copyReport.purged_billing_rows = purgeReport.billingRowsRemoved;
    for (const sourceDir of sourceDirsToDelete) {
      try {
        await deleteDirectoryIfPresent(sourceDir);
      } catch (err) {
        process.stderr.write(
          `[relocation] Warning: failed to delete source dir ${sourceDir}: ${String(err?.message || err)}\n`
        );
      }
    }
    return {
      ok: true,
      run_id: runId,
      category,
      product_id: productId,
      destination_type: LOCAL_DESTINATION,
      destination_path: destinationRoot,
      ...copyReport,
      moved_directories: sourceDirsToDelete.length,
    };
  }

  const destinationPrefix = [
    normalizedSettings.s3Prefix.replace(/^\/+|\/+$/g, ''),
    sanitizePathToken(category, 'category'),
    sanitizePathToken(productId, 'product'),
    sanitizePathToken(runId, 'run'),
  ].filter(Boolean).join('/');

  const uploadResult = await uploadDirectoryToS3({
    rootDir: stageRunRoot,
    region: normalizedSettings.awsRegion,
    bucket: normalizedSettings.s3Bucket,
    prefix: destinationPrefix,
    credentials: toS3Credentials(normalizedSettings),
  });
  const purgeReport = await purgeSharedJsonlSources({
    runId,
    runtimeEventsSourcePath,
    billingLedgerPaths,
  });
  copyReport.purged_runtime_event_rows = purgeReport.runtimeRowsRemoved;
  copyReport.purged_billing_rows = purgeReport.billingRowsRemoved;
  for (const sourceDir of sourceDirsToDelete) {
    try {
      await deleteDirectoryIfPresent(sourceDir);
    } catch (err) {
      process.stderr.write(
        `[relocation] Warning: failed to delete source dir ${sourceDir}: ${String(err?.message || err)}\n`
      );
    }
  }
  return {
    ok: true,
    run_id: runId,
    category,
    product_id: productId,
    destination_type: S3_DESTINATION,
    s3_bucket: normalizedSettings.s3Bucket,
    s3_prefix: uploadResult.uploadedPrefix,
    uploaded_files: uploadResult.uploadedFiles,
    ...copyReport,
    moved_directories: sourceDirsToDelete.length,
  };
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
  }
}
