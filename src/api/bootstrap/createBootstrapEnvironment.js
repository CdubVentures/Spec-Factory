import fsSync from 'node:fs';
import path from 'node:path';
import { loadConfig, loadDotEnvFile } from '../../config.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../../core/config/manifest.js';
import { defaultIndexLabRoot, defaultLocalOutputRoot } from '../../core/config/runtimeArtifactRoots.js';
import { createStorage } from '../../s3/storage.js';
import { SETTINGS_DEFAULTS } from '../../shared/settingsDefaults.js';
import { cleanVariant as canonicalCleanVariant } from '../../features/catalog/index.js';
import {
  resolveProjectPath as resolveProjectPathForRoot,
  normalizeRuntimeArtifactWorkspaceDefaults,
  assertNoShadowHelperRuntime,
  envToken as envTokenFromProcess,
  envBool as envBoolFromProcess,
  resolveStorageBackedWorkspaceRoots as resolveStorageBackedWorkspaceRootsFromSettings,
  resolveRunDataDestinationType,
  createRunDataArchiveStorage,
} from '../guiServerRuntimeConfig.js';
import {
  applyConvergenceSettingsToConfig,
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../../features/settings-authority/index.js';
import { normalizeRunDataStorageSettings } from '../services/runDataRelocationService.js';
import { markEnumSuggestionStatus } from '../helpers/fileHelpers.js';
import { toInt } from '../helpers/valueNormalizers.js';
import { createConfigMutationGate } from '../../core/config/configMutationGate.js';
import { configValue } from '../../shared/settingsAccessor.js';

export function createBootstrapEnvironment({ projectRoot }) {
  const resolveProjectPath = (value, fallback = '') =>
    resolveProjectPathForRoot({ projectRoot, value, fallback });
  const envToken = (name, fallback = '') =>
    envTokenFromProcess({ env: process.env, name, fallback });
  const envBool = (name, fallback = false) =>
    envBoolFromProcess({ env: process.env, name, fallback });
  const resolveStorageBackedWorkspaceRoots = (settings = {}) =>
    resolveStorageBackedWorkspaceRootsFromSettings({
      settings,
      defaultLocalOutputRoot,
    });

  function cleanVariant(v) {
    return canonicalCleanVariant(v);
  }

  function normText(v) {
    return String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function catalogKey(brand, model, variant) {
    return `${normText(brand)}|${normText(model)}|${normText(cleanVariant(variant))}`;
  }

  // ── Args ──
  const args = process.argv.slice(2);
  function argVal(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  }
  const PORT = toInt(
    argVal('port', process.env.PORT || CONFIG_MANIFEST_DEFAULTS.PORT || '8788'),
    Number.parseInt(String(CONFIG_MANIFEST_DEFAULTS.PORT || '8788'), 10) || 8788
  );
  const isLocal = args.includes('--local');
  const explicitLocalOutputRoot = String(argVal('local-output-root', process.env.LOCAL_OUTPUT_ROOT || '') || '').trim();

  // ── Config + Storage ──
  if (!loadDotEnvFile()) {
    loadDotEnvFile(path.join(projectRoot, '.env'));
  }
  const config = loadConfig({
    ...(isLocal ? { localMode: true } : {}),
    ...(argVal('local-input-root', '') ? { localInputRoot: argVal('local-input-root', '') } : {}),
    ...(argVal('local-output-root', '') ? { localOutputRoot: argVal('local-output-root', '') } : {}),
    ...(argVal('output-mode', '') ? { outputMode: argVal('output-mode', '') } : {}),
  });
  const resolvedCategoryAuthorityRoot = resolveProjectPath(
    configValue(config, 'categoryAuthorityRoot'),
    'category_authority',
  );
  config.categoryAuthorityRoot = resolvedCategoryAuthorityRoot;
  config['helper' + 'FilesRoot'] = resolvedCategoryAuthorityRoot;
  config.localOutputRoot = resolveProjectPath(configValue(config, 'localOutputRoot'), defaultLocalOutputRoot());
  config.localInputRoot = resolveProjectPath(configValue(config, 'localInputRoot'), 'fixtures/s3');
  const HELPER_ROOT = resolveProjectPath(config['helper' + 'FilesRoot'], 'category_authority');
  const LAUNCH_CWD = path.resolve(process.cwd());
  assertNoShadowHelperRuntime({
    helperRoot: HELPER_ROOT,
    launchCwd: LAUNCH_CWD,
    existsSync: fsSync.existsSync,
  });
  const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: HELPER_ROOT });
  applyRuntimeSettingsToConfig(config, userSettings.runtime);
  applyConvergenceSettingsToConfig(config, userSettings.convergence);
  normalizeRuntimeArtifactWorkspaceDefaults({
    config,
    projectRoot,
    explicitLocalOutputRoot,
    persistedRuntimeSettings: userSettings.runtime,
    defaultLocalOutputRoot,
    repoDefaultOutputRoot: SETTINGS_DEFAULTS.runtime?.localOutputRoot,
  });

  config.settingsCanonicalOnlyWrites = envBool('SETTINGS_CANONICAL_ONLY_WRITES', false);

  const runDataStorageState = normalizeRunDataStorageSettings({
    enabled: envBool('RUN_DATA_STORAGE_ENABLED', envToken('S3_BUCKET', '') !== ''),
    destinationType: resolveRunDataDestinationType({ env: process.env }),
    localDirectory: envToken('RUN_DATA_STORAGE_LOCAL_DIRECTORY', ''),
    awsRegion: envToken('RUN_DATA_STORAGE_S3_REGION', configValue(config, 'awsRegion')),
    s3Bucket: envToken('RUN_DATA_STORAGE_S3_BUCKET', configValue(config, 's3Bucket')),
    s3Prefix: envToken('RUN_DATA_STORAGE_S3_PREFIX', 'spec-factory-runs'),
    s3AccessKeyId: envToken('RUN_DATA_STORAGE_S3_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID || ''),
    s3SecretAccessKey: envToken('RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY', process.env.AWS_SECRET_ACCESS_KEY || ''),
    s3SessionToken: envToken('RUN_DATA_STORAGE_S3_SESSION_TOKEN', process.env.AWS_SESSION_TOKEN || ''),
    updatedAt: null,
    ...userSettings.storage,
  });
  if (runDataStorageState.awsRegion) config.awsRegion = runDataStorageState.awsRegion;
  if (runDataStorageState.s3Bucket) config.s3Bucket = runDataStorageState.s3Bucket;
  const storageBackedWorkspaceRoots = resolveStorageBackedWorkspaceRoots(runDataStorageState);
  if (storageBackedWorkspaceRoots) {
    if (storageBackedWorkspaceRoots.outputRoot) {
      config.localOutputRoot = storageBackedWorkspaceRoots.outputRoot;
    }
    if (storageBackedWorkspaceRoots.specDbDir) {
      config.specDbDir = storageBackedWorkspaceRoots.specDbDir;
    }
    if (storageBackedWorkspaceRoots.llmExtractionCacheDir) {
      config.llmExtractionCacheDir = storageBackedWorkspaceRoots.llmExtractionCacheDir;
    }
  }
  // WHY: Gate created after all INIT mutations. Runtime mutations flow through applyPatch().
  const configGate = createConfigMutationGate(config);

  const OUTPUT_ROOT = resolveProjectPath(configValue(config, 'localOutputRoot'), defaultLocalOutputRoot());
  const INDEXLAB_ROOT = storageBackedWorkspaceRoots?.indexLabRoot
    ? storageBackedWorkspaceRoots.indexLabRoot
    : resolveProjectPath(argVal('indexlab-root', ''), defaultIndexLabRoot());
  const storage = createStorage(config);
  const runDataArchiveStorage = createRunDataArchiveStorage({
    runDataStorageState,
    config,
    createStorage,
  });

  const markEnumSuggestionStatusBound = (category, field, value, status = 'accepted') =>
    markEnumSuggestionStatus(category, field, value, status, HELPER_ROOT);

  return {
    config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage, runDataStorageState, runDataArchiveStorage,
    resolveProjectPath,
    cleanVariant, catalogKey, markEnumSuggestionStatusBound,
    userSettings,
  };
}
