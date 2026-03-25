import path from 'node:path';
import { configValue } from '../shared/settingsAccessor.js';
import { INPUT_KEY_PREFIX, OUTPUT_KEY_PREFIX } from '../shared/storageKeyPrefixes.js';

export function resolveProjectPath({ projectRoot, value, fallback = '' }) {
  const raw = String(value ?? '').trim();
  const token = raw || String(fallback ?? '').trim();
  if (!token) return path.resolve(String(projectRoot || '.'));
  return path.isAbsolute(token)
    ? path.resolve(token)
    : path.resolve(String(projectRoot || '.'), token);
}

export function normalizeComparablePath(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  const resolved = path.resolve(candidate).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function sameResolvedPath(left, right) {
  const normalizedLeft = normalizeComparablePath(left);
  const normalizedRight = normalizeComparablePath(right);
  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

export function normalizeRuntimeArtifactWorkspaceDefaults({
  config,
  projectRoot,
  explicitLocalOutputRoot = '',
  persistedRuntimeSettings = {},
  defaultLocalOutputRoot,
  repoDefaultOutputRoot = '',
}) {
  if (!config || typeof config !== 'object') return;
  if (typeof defaultLocalOutputRoot !== 'function') return;

  const explicitOutputRoot = String(explicitLocalOutputRoot || '').trim();
  if (explicitOutputRoot) {
    config.localOutputRoot = resolveProjectPath({
      projectRoot,
      value: explicitOutputRoot,
      fallback: defaultLocalOutputRoot(),
    });
    return;
  }

  const persistedOutputRoot = String(
    persistedRuntimeSettings?.localOutputRoot || '',
  ).trim();
  if (!persistedOutputRoot) {
    config.localOutputRoot = resolveProjectPath({
      projectRoot,
      value: configValue(config, 'localOutputRoot'),
      fallback: defaultLocalOutputRoot(),
    });
    return;
  }

  const currentDefaultOutputRoot = defaultLocalOutputRoot();
  const matchesKnownDefault =
    sameResolvedPath(persistedOutputRoot, currentDefaultOutputRoot) ||
    sameResolvedPath(persistedOutputRoot, repoDefaultOutputRoot);
  if (!matchesKnownDefault) {
    config.localOutputRoot = resolveProjectPath({
      projectRoot,
      value: configValue(config, 'localOutputRoot'),
      fallback: defaultLocalOutputRoot(),
    });
    return;
  }

  const previousWorkspaceRoot = path.dirname(path.resolve(persistedOutputRoot));
  const currentWorkspaceRoot = path.dirname(path.resolve(currentDefaultOutputRoot));
  const previousSpecDbDir = path.join(previousWorkspaceRoot, '.specfactory_tmp');
  const currentSpecDbDir = path.join(currentWorkspaceRoot, '.specfactory_tmp');

  config.localOutputRoot = currentDefaultOutputRoot;
  if (sameResolvedPath(config.specDbDir, previousSpecDbDir)) {
    config.specDbDir = currentSpecDbDir;
  }
}

export function parseBooleanToken(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return fallback;
}

export function assertNoShadowHelperRuntime({
  helperRoot,
  launchCwd = process.cwd(),
  existsSync = () => false,
}) {
  const canonicalHelperRoot = path.resolve(String(helperRoot || 'category_authority'));
  const resolvedLaunchCwd = String(launchCwd || process.cwd());
  const legacyHelperDirName = `helper${'_files'}`;
  const launchHelperRoot = path.resolve(resolvedLaunchCwd, legacyHelperDirName);
  const launchCategoryAuthorityRoot = path.resolve(
    resolvedLaunchCwd,
    'category_authority',
  );

  if (canonicalHelperRoot === launchHelperRoot) return;
  if (canonicalHelperRoot === launchCategoryAuthorityRoot) return;

  const shadowRuntimeRoot = path.join(launchHelperRoot, '_runtime');
  if (!existsSync(shadowRuntimeRoot)) return;

  throw new Error(
    [
      'shadow_helper_runtime_detected',
      `launch_runtime=${shadowRuntimeRoot}`,
      `canonical_helper_root=${canonicalHelperRoot}`,
      'Remove the launch-cwd legacy helper shadow path or set HELPER_FILES_ROOT to the canonical project location.',
    ].join(';'),
  );
}

export function envToken({ env = process.env, name, fallback = '' }) {
  const value = String(env?.[name] || '').trim();
  return value || fallback;
}

export function envBool({ env = process.env, name, fallback = false }) {
  return parseBooleanToken(env?.[name], fallback);
}

export function resolveStorageBackedWorkspaceRoots({
  settings = {},
  defaultLocalOutputRoot = () => '',
}) {
  if (!settings || settings.enabled !== true) return null;
  const destinationType = String(settings.destinationType || '')
    .trim()
    .toLowerCase();
  if (destinationType === 's3') {
    const stagingRoot = path.dirname(defaultLocalOutputRoot());
    const workspaceRoot = path.join(stagingRoot, '.specfactory_tmp');
    return {
      outputRoot: null,
      indexLabRoot: null,
      specDbDir: workspaceRoot,
    };
  }
  if (destinationType !== 'local') return null;
  const localDirectory = String(settings.localDirectory || '').trim();
  if (!localDirectory) return null;
  const root = path.resolve(localDirectory);
  const workspaceRoot = path.join(root, '.specfactory_tmp');
  return {
    outputRoot: path.join(root, 'output'),
    indexLabRoot: path.join(root, 'indexlab'),
    specDbDir: workspaceRoot,
  };
}

// WHY: Dynamic derivation of indexLabRoot from live runDataStorageState.
// Same logic as createBootstrapEnvironment lines 138-140, but callable at any time.
export function resolveCurrentIndexLabRoot({ runDataStorageState, defaultIndexLabRoot, defaultLocalOutputRoot }) {
  const roots = resolveStorageBackedWorkspaceRoots({
    settings: runDataStorageState,
    defaultLocalOutputRoot,
  });
  if (roots?.indexLabRoot) return roots.indexLabRoot;
  return defaultIndexLabRoot();
}

export function createRunDataArchiveStorage({
  runDataStorageState,
  config,
  createStorage,
}) {
  if (typeof createStorage !== 'function') return null;
  if (runDataStorageState?.enabled !== true) return null;
  if (
    String(runDataStorageState?.destinationType || '').trim().toLowerCase() !==
    's3'
  ) {
    return null;
  }
  if (!String(runDataStorageState?.s3Bucket || '').trim()) {
    return null;
  }

  return createStorage({
    outputMode: 's3',
    localMode: false,
    awsRegion: String(runDataStorageState.awsRegion || 'us-east-2').trim(),
    s3Bucket: String(runDataStorageState.s3Bucket || '').trim(),
    s3InputPrefix: INPUT_KEY_PREFIX,
    s3OutputPrefix: OUTPUT_KEY_PREFIX,
    localInputRoot: configValue(config, 'localInputRoot'),
    localOutputRoot: configValue(config, 'localOutputRoot'),
  });
}
