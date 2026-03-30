import { loadUserSettingsSync } from '../../settings-authority/index.js';
import { createConfigPersistenceContext } from './configPersistenceContext.js';
import { createIndexingMetricsHandler } from './configIndexingMetricsHandler.js';
import { createLlmSettingsHandler } from './configLlmSettingsHandler.js';
import { createUiSettingsHandler } from './configUiSettingsHandler.js';
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
    appDb,
  } = ctx;
  const settingsRoot =
    HELPER_ROOT
    || config?.categoryAuthorityRoot
    || 'category_authority';
  // WHY: Canonical-only writes are always enforced — no toggle needed.
  const canonicalOnlySettingsWrites = true;
  const initialUserSettings = loadUserSettingsSync({
    categoryAuthorityRoot: settingsRoot,
    appDb,
  });

  const persistenceCtx = createConfigPersistenceContext({
    config,
    settingsRoot,
    canonicalOnlySettingsWrites,
    initialUserSettings,
    appDb,
  });

  const metricsHandler = createIndexingMetricsHandler({
    jsonRes, toInt, config, storage, OUTPUT_ROOT,
    collectLlmModels, llmProviderFromModel, resolvePricingForModel,
    resolveTokenProfileForModel, resolveLlmRoleDefaults, resolveLlmKnobDefaults,
    llmRoutingSnapshot, buildLlmMetrics, buildIndexingDomainChecklist, buildReviewMetrics,
    getSpecDb,
  });

  const llmHandler = createLlmSettingsHandler({
    jsonRes, readJsonBody, getSpecDb, broadcastWs,
  });

  const uiHandler = createUiSettingsHandler({
    jsonRes, readJsonBody, broadcastWs, persistenceCtx,
  });

  const runtimeHandler = createRuntimeSettingsHandler({
    jsonRes, readJsonBody, toInt, config, broadcastWs, persistenceCtx,
  });

  const llmPolicyHandler = createLlmPolicyHandler({
    jsonRes, readJsonBody, config, broadcastWs, persistenceCtx,
  });

  return async function handleConfigRoutes(parts, params, method, req, res) {
    if (parts[0] === 'ui-settings') return uiHandler(parts, params, method, req, res);
    if (parts[0] === 'indexing') return metricsHandler(parts, params, method, req, res);
    if (parts[0] === 'llm-settings') return llmHandler(parts, params, method, req, res);
    if (parts[0] === 'runtime-settings') return runtimeHandler(parts, params, method, req, res);
    if (parts[0] === 'llm-policy') return llmPolicyHandler(parts, params, method, req, res);
    return false;
  };
}
