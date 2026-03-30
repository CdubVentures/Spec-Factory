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
} from '../guiServerRuntimeConfig.js';
import {
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../../features/settings-authority/index.js';
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
  function cleanVariant(v) {
    return canonicalCleanVariant(v);
  }

  function normText(v) {
    return String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
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
    ...(argVal('local-input-root', '') ? { localInputRoot: argVal('local-input-root', '') } : {}),
    ...(argVal('local-output-root', '') ? { localOutputRoot: argVal('local-output-root', '') } : {}),
  });
  const resolvedCategoryAuthorityRoot = resolveProjectPath(
    configValue(config, 'categoryAuthorityRoot'),
    'category_authority',
  );
  config.categoryAuthorityRoot = resolvedCategoryAuthorityRoot;
  config.localOutputRoot = resolveProjectPath(configValue(config, 'localOutputRoot'), defaultLocalOutputRoot());
  config.localInputRoot = resolveProjectPath(configValue(config, 'localInputRoot'), 'fixtures/s3');
  const HELPER_ROOT = resolveProjectPath(config.categoryAuthorityRoot, 'category_authority');
  const LAUNCH_CWD = path.resolve(process.cwd());
  assertNoShadowHelperRuntime({
    helperRoot: HELPER_ROOT,
    launchCwd: LAUNCH_CWD,
    existsSync: fsSync.existsSync,
  });
  const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: HELPER_ROOT });
  applyRuntimeSettingsToConfig(config, userSettings.runtime);
  normalizeRuntimeArtifactWorkspaceDefaults({
    config,
    projectRoot,
    explicitLocalOutputRoot,
    persistedRuntimeSettings: userSettings.runtime,
    defaultLocalOutputRoot,
    repoDefaultOutputRoot: SETTINGS_DEFAULTS.runtime?.localOutputRoot,
  });

  // WHY: Static stub — relocation feature was removed. Downstream consumers
  // (storage manager, process lifecycle) still read enabled=false and degrade gracefully.
  const runDataStorageState = Object.freeze({ enabled: false });
  // WHY: Gate created after all INIT mutations. Runtime mutations flow through applyPatch().
  const configGate = createConfigMutationGate(config);

  const OUTPUT_ROOT = resolveProjectPath(configValue(config, 'localOutputRoot'), defaultLocalOutputRoot());
  const INDEXLAB_ROOT = resolveProjectPath(argVal('indexlab-root', ''), defaultIndexLabRoot());
  const storage = createStorage(config);

  const markEnumSuggestionStatusBound = (category, field, value, status = 'accepted') =>
    markEnumSuggestionStatus(category, field, value, status, HELPER_ROOT);

  return {
    config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage, runDataStorageState,
    resolveProjectPath,
    cleanVariant, markEnumSuggestionStatusBound,
    userSettings,
  };
}
