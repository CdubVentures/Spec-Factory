import { loadUserSettingsSync } from '../../settings-authority/index.js';
import { createConfigPersistenceContext } from './configPersistenceContext.js';
import { createIndexingMetricsHandler } from './configIndexingMetricsHandler.js';
import { createUiSettingsHandler } from './configUiSettingsHandler.js';
import { createRuntimeSettingsHandler } from './configRuntimeSettingsHandler.js';
import { createLlmPolicyHandler } from '../../settings-authority/llmPolicyHandler.js';
import { createGlobalPromptsHandler } from '../../settings-authority/globalPromptsHandler.js';
import { createWriterModelTestHandler } from '../../settings-authority/writerModelTestHandler.js';

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
  const initialUserSettings = loadUserSettingsSync({ appDb });

  const persistenceCtx = createConfigPersistenceContext({
    config,
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

  const uiHandler = createUiSettingsHandler({
    jsonRes, readJsonBody, broadcastWs, persistenceCtx,
  });

  const runtimeHandler = createRuntimeSettingsHandler({
    jsonRes, readJsonBody, toInt, config, broadcastWs, persistenceCtx,
    // WHY: Threaded in so the handler can auto-fire reconcileThreshold
    // across all categories when publishConfidenceThreshold changes.
    getSpecDb,
  });

  const llmPolicyHandler = createLlmPolicyHandler({
    jsonRes, readJsonBody, config, broadcastWs, persistenceCtx,
  });

  const globalPromptsHandler = createGlobalPromptsHandler({
    jsonRes, readJsonBody, broadcastWs,
  });

  const writerModelTestHandler = createWriterModelTestHandler({
    jsonRes, config, broadcastWs,
  });

  return async function handleConfigRoutes(parts, params, method, req, res) {
    if (parts[0] === 'ui-settings') return uiHandler(parts, params, method, req, res);
    if (parts[0] === 'indexing') return metricsHandler(parts, params, method, req, res);
    if (parts[0] === 'runtime-settings') return runtimeHandler(parts, params, method, req, res);
    if (parts[0] === 'llm-policy' && parts[1] === 'writer-test') {
      return writerModelTestHandler(parts, params, method, req, res);
    }
    // Global prompts subroute must match before generic llm-policy (same prefix).
    if (parts[0] === 'llm-policy' && parts[1] === 'global-prompts') {
      return globalPromptsHandler(parts, params, method, req, res);
    }
    if (parts[0] === 'llm-policy') return llmPolicyHandler(parts, params, method, req, res);
    return false;
  };
}
