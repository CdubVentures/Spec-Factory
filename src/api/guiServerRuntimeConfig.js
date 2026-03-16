import path from 'node:path';

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
      value: config.localOutputRoot,
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
      value: config.localOutputRoot,
      fallback: defaultLocalOutputRoot(),
    });
    return;
  }

  const previousWorkspaceRoot = path.dirname(path.resolve(persistedOutputRoot));
  const currentWorkspaceRoot = path.dirname(path.resolve(currentDefaultOutputRoot));
  const previousSpecDbDir = path.join(previousWorkspaceRoot, '.specfactory_tmp');
  const currentSpecDbDir = path.join(currentWorkspaceRoot, '.specfactory_tmp');
  const previousLlmCacheDir = path.join(previousSpecDbDir, 'llm_cache');
  const currentLlmCacheDir = path.join(currentSpecDbDir, 'llm_cache');

  config.localOutputRoot = currentDefaultOutputRoot;
  if (sameResolvedPath(config.specDbDir, previousSpecDbDir)) {
    config.specDbDir = currentSpecDbDir;
  }
  if (sameResolvedPath(config.llmExtractionCacheDir, previousLlmCacheDir)) {
    config.llmExtractionCacheDir = currentLlmCacheDir;
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
      llmExtractionCacheDir: path.join(workspaceRoot, 'llm_cache'),
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
    llmExtractionCacheDir: path.join(workspaceRoot, 'llm_cache'),
  };
}

export function resolveRunDataDestinationType({ env = process.env }) {
  const explicit = envToken({
    env,
    name: 'RUN_DATA_STORAGE_DESTINATION_TYPE',
    fallback: '',
  }).toLowerCase();
  if (explicit === 's3' || explicit === 'local') return explicit;
  return envToken({ env, name: 'S3_BUCKET', fallback: '' }) ? 's3' : 'local';
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
    awsRegion: String(
      runDataStorageState.awsRegion || config.awsRegion || 'us-east-2',
    ).trim(),
    s3Bucket: String(
      runDataStorageState.s3Bucket || config.s3Bucket || '',
    ).trim(),
    s3InputPrefix: config.s3InputPrefix || 'specs/inputs',
    s3OutputPrefix: config.s3OutputPrefix || 'specs/outputs',
    localInputRoot: config.localInputRoot,
    localOutputRoot: config.localOutputRoot,
  });
}
