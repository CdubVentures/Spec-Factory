/**
 * Release Date Finder — prompt preview compiler.
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
import { buildReleaseDateFinderPrompt } from './releaseDateLlmAdapter.js';
import { releaseDateFinderResponseSchema } from './releaseDateSchema.js';
import { readReleaseDates } from './releaseDateStore.js';

const FINDER_NAME = 'releaseDateFinder';
const PHASE_KEY = 'releaseDateFinder';
const LOOP_NOTE = 'Loop mode shows iteration 1 only; subsequent iterations depend on LLM responses and cannot be pre-compiled.';

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

export async function compileReleaseDateFinderPreviewPrompt(ctx) {
  const { product, appDb, specDb, config = {}, productRoot, logger = null, body = {} } = ctx;
  const mode = body.mode === 'loop' ? 'loop' : 'run';

  const dbVariants = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariants.length === 0) {
    return {
      finder: 'rdf', mode, compiled_at: Date.now(),
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

  const doc = readReleaseDates({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(doc?.runs) ? doc.runs : [];

  const previousDiscovery = resolveScalarPreviousDiscovery({
    previousRuns, variant, urlHistoryEnabled, queryHistoryEnabled,
  });

  const { domainArgs, userMessage, inputsResolved, notes: baseNotes } = resolveScalarFinderPromptInputs({
    product, variant, allVariants,
    siblingsExcluded, familyModelCount, ambiguityLevel,
    previousDiscovery, promptOverride,
  });

  const system = buildReleaseDateFinderPrompt(domainArgs);

  const modelInfo = {
    id: resolvePhaseModel(config, PHASE_KEY) || String(config.llmModelPlan || 'unknown'),
    thinking_effort: config._resolvedReleaseDateFinderThinkingEffort || '',
    web_search: Boolean(config._resolvedReleaseDateFinderWebSearch),
    json_strict: config._resolvedReleaseDateFinderJsonStrict !== false,
  };

  const label = mode === 'loop' ? 'release-date (loop iter-1)' : 'release-date';
  const notes = mode === 'loop' ? [...baseNotes, LOOP_NOTE] : baseNotes;

  // appDb is accepted for symmetry with CEF/PIF contexts; RDF does not read it.
  void appDb;

  return {
    finder: 'rdf',
    mode,
    compiled_at: Date.now(),
    prompts: [{
      label,
      system,
      user: userMessage,
      schema: zodToLlmSchema(releaseDateFinderResponseSchema),
      model: modelInfo,
      notes,
    }],
    inputs_resolved: inputsResolved,
  };
}
