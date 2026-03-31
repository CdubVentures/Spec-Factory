import path from 'node:path';

import { buildRunId } from '../../../../shared/primitives.js';
import { writeRuntimeSettingsSnapshot } from '../../../../core/config/runtimeSettingsSnapshot.js';

function buildError(status, body) {
  return { ok: false, status, body };
}

function normalizeJoinedList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(',');
  }
  return String(value || '').trim();
}

export function buildProcessStartLaunchPlan(options = {}) {
  const {
    body = {},
    helperRoot = '',
    outputRoot = '',
    indexLabRoot = '',
    env = process.env,
    pathApi = path,
    buildRunIdFn = buildRunId,
  } = options;

  const {
    category,
    productId,
    brand,
    model: modelName,
    variant,
    sku,
    seedUrls,
    mode = 'indexlab',
    profile,
    dryRun,
    specDbDir,
    categoryAuthorityRoot: legacyHelperFilesRoot,
    localOutputRoot,
    searchEngines,
    seed,
    fields,
    providers,
    indexlabOut,
    replaceRunning = true,
  } = body;

  const cat = category || 'mouse';
  const categoryAuthorityRoot = String(
    body?.categoryAuthorityRoot
    || legacyHelperFilesRoot
    || '',
  ).trim();

  if (String(mode || 'indexlab').trim() !== 'indexlab') {
    return buildError(400, {
      error: 'unsupported_process_mode',
      message: 'Only indexlab mode is supported in GUI process/start.',
    });
  }

  const effectiveHelperRoot = categoryAuthorityRoot
    ? pathApi.resolve(categoryAuthorityRoot)
    : pathApi.resolve(String(env.CATEGORY_AUTHORITY_ROOT || env.HELPER_FILES_ROOT || helperRoot || 'category_authority'));
  const generatedRulesCandidates = [
    pathApi.join(effectiveHelperRoot, cat, '_generated', 'field_rules.json'),
  ];

  const rawRequestedRunId = String(body?.requestedRunId || body?.runId || '').trim();
  const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(rawRequestedRunId)
    ? rawRequestedRunId
    : buildRunIdFn();

  const effectiveIndexLabOut = indexlabOut || indexLabRoot || '';
  const effectiveLocalOutputRoot = localOutputRoot || outputRoot || '';
  const effectiveSpecDbDir = specDbDir || '';

  const cliArgs = ['indexlab', '--local', '--run-id', requestedRunId, '--category', cat];
  if (productId) {
    cliArgs.push('--product-id', String(productId).trim());
  } else if (seed) {
    cliArgs.push('--seed', String(seed).trim());
  }
  if (brand) cliArgs.push('--brand', String(brand).trim());
  if (modelName) cliArgs.push('--model', String(modelName).trim());
  if (variant) cliArgs.push('--variant', String(variant).trim());
  if (sku) cliArgs.push('--sku', String(sku).trim());

  const normalizedSeedUrls = normalizeJoinedList(seedUrls);
  if (normalizedSeedUrls) cliArgs.push('--seed-urls', normalizedSeedUrls);
  const normalizedFields = normalizeJoinedList(fields);
  if (normalizedFields) cliArgs.push('--fields', normalizedFields);
  const normalizedProviders = normalizeJoinedList(providers);
  if (normalizedProviders) cliArgs.push('--providers', normalizedProviders);

  const normalizedSearchEngines = String(searchEngines || '').trim().toLowerCase();
  if (normalizedSearchEngines) {
    cliArgs.push('--search-engines', normalizedSearchEngines);
  }

  if (effectiveIndexLabOut) {
    cliArgs.push('--out', String(effectiveIndexLabOut).trim());
  }
  if (profile && ['fast', 'standard', 'thorough'].includes(profile)) {
    cliArgs.push('--profile', profile);
  }
  if (dryRun) {
    cliArgs.push('--dry-run');
  }

  // WHY: Only path-resolution env vars that must exist before config loads.
  // All runtime settings reach the child via the snapshot (Plan 05 Step 6).
  const envOverrides = {
    DYNAMIC_CRAWLEE_ENABLED: 'false',
  };

  const specDbDirNormalized = String(effectiveSpecDbDir || '').trim();
  if (specDbDirNormalized) envOverrides.SPEC_DB_DIR = specDbDirNormalized;
  if (categoryAuthorityRoot) {
    envOverrides.HELPER_FILES_ROOT = categoryAuthorityRoot;
    envOverrides.CATEGORY_AUTHORITY_ROOT = categoryAuthorityRoot;
  }
  const localOutputNormalized = String(effectiveLocalOutputRoot || '').trim();
  if (localOutputNormalized) envOverrides.LOCAL_OUTPUT_ROOT = localOutputNormalized;

  // WHY: Plan 05 — runtime settings snapshot is the SSOT for child settings.
  // The child reads this via RUNTIME_SETTINGS_SNAPSHOT env var in config.js.
  try {
    const snapshotPath = writeRuntimeSettingsSnapshot(requestedRunId, body);
    envOverrides.RUNTIME_SETTINGS_SNAPSHOT = snapshotPath;
  } catch (err) {
    return buildError(500, {
      error: 'snapshot_write_failed',
      message: `Failed to write runtime settings snapshot: ${err?.message || err}`,
    });
  }

  return {
    ok: true,
    requestedRunId,
    cliArgs,
    envOverrides,
    replaceRunning,
    effectiveHelperRoot,
    generatedRulesCandidates,
  };
}
