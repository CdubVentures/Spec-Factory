/**
 * SKU Finder — prompt preview compiler.
 *
 * Compiles the exact prompt the next run would dispatch for a single variant,
 * without invoking the LLM, registering operations, or persisting anything.
 * Routes on ctx.body.mode ∈ {run, loop}. Loop mode shows iteration 1 only;
 * subsequent iterations depend on LLM responses and cannot be pre-compiled.
 *
 * Shares the scalar prompt-input resolver with the real orchestrator so preview
 * and run output stay byte-identical by construction.
 */

import {
  resolveScalarFinderPromptInputs,
  resolveScalarPreviousDiscovery,
} from '../../core/finder/resolveScalarFinderPromptInputs.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { resolveAmbiguityContext } from '../../core/finder/finderOrchestrationHelpers.js';
import { resolvePhaseModel } from '../../core/llm/client/routing.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { buildSkuFinderPrompt } from './skuLlmAdapter.js';
import { skuFinderResponseSchema } from './skuSchema.js';
import { readSkus } from './skuStore.js';

const FINDER_NAME = 'skuFinder';
const PHASE_KEY = 'skuFinder';
const LOOP_NOTE = 'Loop mode shows iteration 1 only; subsequent iterations depend on LLM responses and cannot be pre-compiled.';

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

export async function compileSkuFinderPreviewPrompt(ctx) {
  const { product, appDb, specDb, config = {}, productRoot, logger = null, body = {} } = ctx;
  const mode = body.mode === 'loop' ? 'loop' : 'run';

  const dbVariants = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariants.length === 0) {
    return {
      finder: 'sku', mode, compiled_at: Date.now(),
      prompts: [], inputs_resolved: { product_id: product.product_id },
      notes: ['No active variants — run CEF first.'],
    };
  }

  const allVariants = dbVariants.map((v) => ({
    variant_id: v.variant_id,
    key: v.variant_key,
    label: v.variant_label,
    type: v.variant_type,
  }));

  const requestedVariantKey = body.variant_key || allVariants[0].key;
  const variant = allVariants.find((v) => v.key === requestedVariantKey);
  if (!variant) throw err(404, `variant not found: ${requestedVariantKey}`);

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot, logger,
  });
  const siblingsExcluded = [];
  for (const m of siblingModels) {
    if (m && !siblingsExcluded.includes(m)) siblingsExcluded.push(m);
  }

  const finderStore = specDb.getFinderStore(FINDER_NAME);
  const promptOverride = finderStore?.getSetting?.('discoveryPromptTemplate') || '';
  const urlHistoryEnabled = finderStore?.getSetting?.('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore?.getSetting?.('queryHistoryEnabled') === 'true';

  const doc = readSkus({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(doc?.runs) ? doc.runs : [];

  const scope = { variant_id: variant.variant_id || '', mode: '' };
  const suppRows = (finderStore?.listSuppressions?.(product.product_id) || [])
    .filter((s) => s.variant_id === scope.variant_id && s.mode === scope.mode);

  const previousDiscovery = resolveScalarPreviousDiscovery({
    previousRuns, variant, urlHistoryEnabled, queryHistoryEnabled, suppRows,
  });

  const { domainArgs, userMessage, inputsResolved, notes: baseNotes } = resolveScalarFinderPromptInputs({
    product, variant, allVariants,
    siblingsExcluded, familyModelCount, ambiguityLevel,
    previousDiscovery, promptOverride,
  });

  const system = buildSkuFinderPrompt(domainArgs);

  const modelInfo = {
    id: resolvePhaseModel(config, PHASE_KEY) || String(config.llmModelPlan || 'unknown'),
    thinking_effort: config._resolvedSkuFinderThinkingEffort || '',
    web_search: Boolean(config._resolvedSkuFinderWebSearch),
    json_strict: config._resolvedSkuFinderJsonStrict !== false,
  };

  const label = mode === 'loop' ? 'sku (loop iter-1)' : 'sku';
  const notes = mode === 'loop' ? [...baseNotes, LOOP_NOTE] : baseNotes;

  void appDb;

  return {
    finder: 'sku',
    mode,
    compiled_at: Date.now(),
    prompts: [{
      label,
      system,
      user: userMessage,
      schema: zodToLlmSchema(skuFinderResponseSchema),
      model: modelInfo,
      notes,
    }],
    inputs_resolved: inputsResolved,
  };
}
