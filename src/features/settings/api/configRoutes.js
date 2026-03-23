import { normalizeRunDataStorageSettings } from '../../../api/services/runDataRelocationService.js';
import { loadUserSettingsSync } from '../../settings-authority/index.js';
import { buildSettingsManifest } from './settingsManifestBuilder.js';
import { createConfigPersistenceContext } from './configPersistenceContext.js';
import { createIndexingMetricsHandler } from './configIndexingMetricsHandler.js';
import { createLlmSettingsHandler } from './configLlmSettingsHandler.js';
import { createUiSettingsHandler } from './configUiSettingsHandler.js';
import { createStorageSettingsHandler } from './configStorageSettingsHandler.js';
import { createConvergenceSettingsHandler } from './configConvergenceSettingsHandler.js';
import { createRuntimeSettingsHandler } from './configRuntimeSettingsHandler.js';
import { createLlmPolicyHandler } from '../../settings-authority/llmPolicyHandler.js';

export function registerConfigRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    configGate,
    toInt,
    collectLlmModels,
    llmProviderFromModel,
    resolvePricingForModel,
    resolveTokenProfileForModel,
    resolveLlmRoleDefaults,
    resolveLlmKnobDefaults,
    llmRoutingSnapshot,
    buildLlmMetrics,
    buildIndexingDomainChecklist,
    buildReviewMetrics,
    getSpecDb,
    storage,
    OUTPUT_ROOT,
    broadcastWs,
    HELPER_ROOT,
    runDataStorageState: providedRunDataStorageState,
  } = ctx;
  const runDataStorageState = providedRunDataStorageState && typeof providedRunDataStorageState === 'object'
    ? providedRunDataStorageState
    : {};
  Object.assign(
    runDataStorageState,
    normalizeRunDataStorageSettings(
      runDataStorageState,
      runDataStorageState,
      { preserveExplicitVolatileLocalDirectory: true },
    ),
  );
  const settingsRoot =
    HELPER_ROOT
    || config?.categoryAuthorityRoot
    || 'category_authority';
  const canonicalOnlySettingsWrites = (
    (typeof config?.settingsCanonicalOnlyWrites === 'boolean')
      ? config.settingsCanonicalOnlyWrites
        : (() => {
          const raw = process.env.SETTINGS_CANONICAL_ONLY_WRITES;
          if (raw === undefined || raw === null || raw === '') return true;
          const token = String(raw).trim().toLowerCase();
          if (['1', 'true', 'yes', 'on'].includes(token)) return true;
          if (['0', 'false', 'no', 'off'].includes(token)) return false;
          return true;
        })()
  );
  const initialUserSettings = loadUserSettingsSync({
    categoryAuthorityRoot: settingsRoot,
  });

  const persistenceCtx = createConfigPersistenceContext({
    config,
    settingsRoot,
    canonicalOnlySettingsWrites,
    runDataStorageState,
    initialUserSettings,
  });

  const metricsHandler = createIndexingMetricsHandler({
    jsonRes, toInt, config, storage, OUTPUT_ROOT,
    collectLlmModels, llmProviderFromModel, resolvePricingForModel,
    resolveTokenProfileForModel, resolveLlmRoleDefaults, resolveLlmKnobDefaults,
    llmRoutingSnapshot, buildLlmMetrics, buildIndexingDomainChecklist, buildReviewMetrics,
  });

  const llmHandler = createLlmSettingsHandler({
    jsonRes, readJsonBody, getSpecDb, broadcastWs,
  });

  const uiHandler = createUiSettingsHandler({
    jsonRes, readJsonBody, broadcastWs, persistenceCtx,
  });

  const storageHandler = createStorageSettingsHandler({
    jsonRes, readJsonBody, toInt, broadcastWs, config, configGate, persistenceCtx,
  });

  const convergenceHandler = createConvergenceSettingsHandler({
    jsonRes, readJsonBody, config, broadcastWs, persistenceCtx,
  });

  const runtimeHandler = createRuntimeSettingsHandler({
    jsonRes, readJsonBody, toInt, config, broadcastWs, persistenceCtx,
  });

  const llmPolicyHandler = createLlmPolicyHandler({
    jsonRes, readJsonBody, config, broadcastWs, persistenceCtx,
  });

  return async function handleConfigRoutes(parts, params, method, req, res) {
    if (parts[0] === 'ui-settings') return uiHandler(parts, params, method, req, res);
    if (parts[0] === 'storage-settings') return storageHandler(parts, params, method, req, res);
    if (parts[0] === 'indexing') return metricsHandler(parts, params, method, req, res);
    if (parts[0] === 'llm-settings') return llmHandler(parts, params, method, req, res);
    if (parts[0] === 'convergence-settings') return convergenceHandler(parts, params, method, req, res);
    if (parts[0] === 'runtime-settings') return runtimeHandler(parts, params, method, req, res);
    if (parts[0] === 'llm-policy') return llmPolicyHandler(parts, params, method, req, res);
    if (parts[0] === 'settings-manifest' && method === 'GET') {
      return jsonRes(res, 200, { ok: true, manifest: buildSettingsManifest() });
    }
    return false;
  };
}
