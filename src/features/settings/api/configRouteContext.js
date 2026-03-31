import {
  llmProviderFromModel, resolveLlmRoleDefaults, resolveLlmKnobDefaults,
  resolvePricingForModel, resolveTokenProfileForModel, collectLlmModels,
} from '../../../api/helpers/llmHelpers.js';
import { llmRoutingSnapshot } from '../../../core/llm/client/routing.js';
import { buildLlmMetrics } from '../../../publish/publishingPipeline.js';
import { buildIndexingDomainChecklist } from '../../indexing/api/index.js';
import { buildReviewMetrics } from '../../review-curation/index.js';

export function createConfigRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, config, configGate, toInt,
    getSpecDb, storage, OUTPUT_ROOT, broadcastWs, HELPER_ROOT, appDb,
  } = options;

  return {
    jsonRes, readJsonBody, config, configGate, toInt, collectLlmModels, llmProviderFromModel,
    resolvePricingForModel, resolveTokenProfileForModel, resolveLlmRoleDefaults,
    resolveLlmKnobDefaults, llmRoutingSnapshot, buildLlmMetrics,
    buildIndexingDomainChecklist, buildReviewMetrics, getSpecDb, storage,
    OUTPUT_ROOT, broadcastWs, HELPER_ROOT, appDb,
  };
}
