/**
 * Color & Edition Finder — prompt preview compiler.
 *
 * Resolves the exact input args that the orchestrator passes to
 * buildColorEditionFinderPrompt at runtime, and exposes them both as a
 * pure resolver (used by the orchestrator to avoid drift) and as a
 * preview-envelope builder (used by the preview-prompt HTTP route).
 *
 * No LLM dispatch, no persistence, no operation registration.
 */

import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { resolveAmbiguityContext } from '../../core/finder/finderOrchestrationHelpers.js';
import { resolvePhaseModel } from '../../core/llm/client/routing.js';
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { readColorEditionSqlFirst } from './colorEditionRuntimeState.js';
import { buildColorEditionFinderPrompt } from './colorEditionLlmAdapter.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { colorEditionFinderResponseSchema } from './colorEditionSchema.js';

/**
 * Pure input resolver — mirrors the input assembly inside runColorEditionFinder
 * so both the real run's snapshot and the preview endpoint compile from the
 * same source of truth.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, base_model, model, variant }
 * @param {object} opts.appDb — AppDb (listColors)
 * @param {object} opts.specDb — SpecDb (finderStore + variants + settings)
 * @param {object} [opts.config] — LLM config
 * @param {string} [opts.productRoot] — override for color_edition.json location
 * @param {object} [opts.logger]
 * @returns {Promise<{ promptInputs, userMessage, modelInfo, notes, inputsResolved }>}
 */
export async function resolveColorEditionDiscoveryInputs({
  product,
  appDb,
  specDb,
  config = {},
  productRoot,
  logger = null,
  existing: preloadedExisting,
}) {
  const root = productRoot || defaultProductRoot();
  const finderStore = specDb.getFinderStore('colorEditionFinder');
  const discoveryPromptTemplate = finderStore.getSetting('discoveryPromptTemplate') || '';
  const urlHistoryEnabled = finderStore.getSetting('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore.getSetting('queryHistoryEnabled') === 'true';

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config,
    category: product.category,
    brand: product.brand,
    baseModel: product.base_model,
    currentModel: product.model,
    specDb,
    resolveFn: resolveIdentityAmbiguitySnapshot,
    logger,
  });

  const allColors = appDb.listColors();
  const colorNames = allColors.map((c) => c.name);

  const existing = preloadedExisting !== undefined
    ? preloadedExisting
    : readColorEditionSqlFirst({
      finderStore,
      variantStore: specDb.variants,
      productId: product.product_id,
      productRoot: root,
    });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // CEF nests discovery_log under response.discovery.discovery_log — lift it
  // to the canonical flat path so accumulateDiscoveryLog reads it correctly.
  const normalizedRuns = previousRuns.map((r) => ({
    ...r,
    response: { ...(r.response || {}), discovery_log: r.response?.discovery?.discovery_log },
  }));
  const previousDiscovery = accumulateDiscoveryLog(normalizedRuns, {
    includeUrls: urlHistoryEnabled,
    includeQueries: queryHistoryEnabled,
  });

  const promptInputs = {
    colorNames,
    colors: allColors,
    product,
    previousRuns,
    previousDiscovery,
    familyModelCount,
    ambiguityLevel,
    siblingModels,
    templateOverride: discoveryPromptTemplate,
  };

  const userMessage = JSON.stringify({
    brand: product.brand || '',
    category: product.category || '',
    base_model: product.base_model || '',
    model: product.model || '',
    variant: product.variant || '',
  });

  const modelInfo = {
    id: resolvePhaseModel(config, 'colorFinder') || String(config.llmModelPlan || 'unknown'),
    thinking_effort: config._resolvedColorFinderThinkingEffort || '',
    web_search: Boolean(config._resolvedColorFinderWebSearch),
    json_strict: config._resolvedColorFinderJsonStrict !== false,
  };

  const urlCount = Array.isArray(previousDiscovery.urlsChecked) ? previousDiscovery.urlsChecked.length : 0;
  const queryCount = Array.isArray(previousDiscovery.queriesRun) ? previousDiscovery.queriesRun.length : 0;
  const notes = [
    `Identity tier: ${ambiguityLevel} · ${familyModelCount} model(s) in family${siblingModels.length ? ` · siblings: ${siblingModels.join(', ')}` : ''}`,
    `Palette: ${allColors.length} color atom(s)`,
    `Previous runs: ${previousRuns.length} · discovery history ${urlHistoryEnabled ? 'on' : 'off'}/${queryHistoryEnabled ? 'on' : 'off'} (urls/queries) · ${urlCount} url(s) · ${queryCount} query(ies)`,
    discoveryPromptTemplate ? 'Custom discovery prompt template override active' : 'Default discovery prompt template',
  ];

  const inputsResolved = {
    product_id: product.product_id,
    category: product.category,
    family_model_count: familyModelCount,
    ambiguity_level: ambiguityLevel,
    sibling_models: siblingModels,
    palette_size: allColors.length,
    previous_run_count: previousRuns.length,
    url_history_enabled: urlHistoryEnabled,
    query_history_enabled: queryHistoryEnabled,
    discovery_urls_injected: urlCount,
    discovery_queries_injected: queryCount,
  };

  return { promptInputs, userMessage, modelInfo, notes, inputsResolved };
}

/**
 * Compile the preview envelope for CEF. Invoked by the generic preview-prompt
 * route handler. Pure — no LLM call, no persistence.
 *
 * @param {object} ctx — generic preview context from finderRoutes.js
 * @returns {Promise<object>} preview response envelope
 */
export async function compileColorEditionPreviewPrompt(ctx) {
  const { promptInputs, userMessage, modelInfo, notes, inputsResolved } =
    await resolveColorEditionDiscoveryInputs(ctx);
  const system = buildColorEditionFinderPrompt(promptInputs);

  return {
    finder: 'cef',
    mode: 'run',
    compiled_at: Date.now(),
    prompts: [{
      label: 'discovery',
      system,
      user: userMessage,
      schema: zodToLlmSchema(colorEditionFinderResponseSchema),
      model: modelInfo,
      notes,
    }],
    inputs_resolved: inputsResolved,
  };
}
