/**
 * Key Finder — prompt preview compiler.
 *
 * Compiles the exact prompt the current preview settings would dispatch for a single
 * (product, field_key) pair, without invoking the LLM, registering an
 * operation, or persisting anything. Mirrors skuFinderPreviewPrompt.js
 * but scopes on field_key (keyFinder is product-scoped, not per-variant).
 *
 * Shares buildPassengers + the knob-reader pattern with runKeyFinder so
 * preview and live runner produce byte-identical prompts by construction.
 */

import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { resolvePhaseModelByTier } from '../../core/llm/client/routing.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { FieldRulesEngine } from '../../engine/fieldRulesEngine.js';

import { buildKeyFinderPrompt } from './keyLlmAdapter.js';
import { buildPassengers } from './keyPassengerBuilder.js';
import {
  buildComponentRelationIndex,
  resolveProductComponentInventory,
  resolveKeyComponentRelation,
  readKnownFieldsByProduct,
} from '../../core/finder/productResolvedStateReader.js';
import { keyFinderResponseSchema } from './keySchema.js';
import { readKeyFinder } from './keyStore.js';

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function parseJsonSetting(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readKnob(finderStore, key) {
  return finderStore?.getSetting?.(key) || '';
}

function readBoolKnob(finderStore, key, defaultTrue = true) {
  const raw = readKnob(finderStore, key);
  if (raw === '') return defaultTrue;
  return raw === 'true';
}

function readFloatKnob(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Mirrors runKeyFinder step 2 (keyFinder.js:160-178) — kept inline rather
// than extracted so drift becomes obvious if one side changes and the other
// doesn't. Both call sites feed the same settings shape to buildPassengers
// and buildKeyFinderPrompt.
function readSettings(specDb) {
  const finderStore = specDb?.getFinderStore?.('keyFinder') ?? null;
  return {
    discoveryPromptTemplate: readKnob(finderStore, 'discoveryPromptTemplate'),
    urlHistoryEnabled: readBoolKnob(finderStore, 'urlHistoryEnabled', true),
    queryHistoryEnabled: readBoolKnob(finderStore, 'queryHistoryEnabled', true),
    componentInjectionEnabled: readBoolKnob(finderStore, 'componentInjectionEnabled', true),
    knownFieldsInjectionEnabled: readBoolKnob(finderStore, 'knownFieldsInjectionEnabled', true),
    searchHintsInjectionEnabled: readBoolKnob(finderStore, 'searchHintsInjectionEnabled', true),
    bundlingEnabled: readBoolKnob(finderStore, 'bundlingEnabled', false),
    alwaysSoloRun: readBoolKnob(finderStore, 'alwaysSoloRun', true),
    groupBundlingOnly: readBoolKnob(finderStore, 'groupBundlingOnly', true),
    bundlingOverlapCapEasy: parseInt(readKnob(finderStore, 'bundlingOverlapCapEasy') || '2', 10),
    bundlingOverlapCapMedium: parseInt(readKnob(finderStore, 'bundlingOverlapCapMedium') || '4', 10),
    bundlingOverlapCapHard: parseInt(readKnob(finderStore, 'bundlingOverlapCapHard') || '6', 10),
    bundlingOverlapCapVeryHard: parseInt(readKnob(finderStore, 'bundlingOverlapCapVeryHard') || '0', 10),
    bundlingPassengerCost: parseJsonSetting(readKnob(finderStore, 'bundlingPassengerCost'), { easy: 1, medium: 2, hard: 4, very_hard: 8 }),
    bundlingPassengerVariantCostPerExtra: readFloatKnob(readKnob(finderStore, 'bundlingPassengerVariantCostPerExtra'), 0.25),
    bundlingPoolPerPrimary: parseJsonSetting(readKnob(finderStore, 'bundlingPoolPerPrimary'), { easy: 6, medium: 4, hard: 2, very_hard: 1 }),
    passengerDifficultyPolicy: readKnob(finderStore, 'passengerDifficultyPolicy') || 'less_or_equal',
    passengerExcludeAtConfidence: parseInt(readKnob(finderStore, 'passengerExcludeAtConfidence') || '95', 10),
    passengerExcludeMinEvidence: parseInt(readKnob(finderStore, 'passengerExcludeMinEvidence') || '3', 10),
    bundlingSortAxisOrder: readKnob(finderStore, 'bundlingSortAxisOrder') || '',
  };
}

async function resolveIdentityForPreview({ config, product, specDb, logger }) {
  // WHY: Identity ambiguity shapes the warning strength in the prompt. Fall
  // back silently to 'easy' to match runKeyFinder's behavior on lookup
  // failure (keyFinder.js:91-112).
  try {
    const snap = await resolveIdentityAmbiguitySnapshot({
      config,
      category: product.category,
      identityLock: { brand: product.brand, base_model: product.base_model },
      specDb,
      currentModel: product.model || '',
      logger,
    });
    return {
      familyModelCount: snap?.family_model_count || 1,
      ambiguityLevel: snap?.ambiguity_level || 'easy',
      siblingsExcluded: Array.isArray(snap?.sibling_models) ? snap.sibling_models.filter(Boolean) : [],
    };
  } catch {
    return { familyModelCount: 1, ambiguityLevel: 'easy', siblingsExcluded: [] };
  }
}

export async function compileKeyFinderPreviewPrompt(ctx) {
  const { product, specDb, config = {}, productRoot, logger = null, body = {} } = ctx;

  const fieldKey = String(body?.field_key || '').trim();
  if (!fieldKey) throw err(400, 'field_key is required');
  if (isReservedFieldKey(fieldKey)) {
    throw err(400, `reserved_field_key: ${fieldKey} is owned by another finder`);
  }

  const engine = await FieldRulesEngine.create(product.category, { specDb });
  const fieldRule = engine.rules?.[fieldKey];
  if (!fieldRule) throw err(400, `missing_field_rule: ${fieldKey} not in compiled rules`);

  const settings = readSettings(specDb);
  const mode = body?.mode === 'loop' ? 'loop' : 'run';
  const activeVariants = specDb?.variants?.listActive?.(product.product_id) || [];
  const variantCount = activeVariants.length > 0 ? activeVariants.length : 1;

  // Preview is always Loop-shape — it shows the compiled prompt the next
  // Loop iteration would dispatch. Run dispatches may still be solo under
  // alwaysSoloRun=true, but the preview is the "full potential bundle" view
  // so users can always see the passenger list being offered. Contract:
  // preview ignores alwaysSoloRun; only buildPassengers' own gates (bundling
  // enabled, exclude knobs, registry caps, difficulty policy) affect the
  // packed list.
  const passengers = buildPassengers({
    primary: { fieldKey, fieldRule },
    engineRules: engine.rules,
    specDb,
    productId: product.product_id,
    settings,
    variantCount,
  });

  const previousDoc = readKeyFinder({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];
  const { urlsChecked, queriesRun } = accumulateDiscoveryLog(previousRuns, {
    runMatcher: (r) =>
      r?.response?.primary_field_key === fieldKey
      || (r?.response?.results && Object.prototype.hasOwnProperty.call(r.response.results, fieldKey)),
    includeUrls: settings.urlHistoryEnabled,
    includeQueries: settings.queryHistoryEnabled,
  });

  const { familyModelCount, ambiguityLevel, siblingsExcluded } =
    await resolveIdentityForPreview({ config, product, specDb, logger });

  // Context injection upstreams — mirrors keyFinder.js step 6.7 so preview
  // and live runner produce byte-identical prompts (drift guard enforces).
  const componentRelationIndex = buildComponentRelationIndex(engine.rules);
  const productComponents = resolveProductComponentInventory({
    specDb, productId: product.product_id,
    compiledRulesFields: engine.rules, componentRelationIndex,
  });
  const componentKeysInInventory = new Set();
  for (const c of productComponents) {
    componentKeysInInventory.add(c.parentFieldKey);
    for (const sf of c.subfields) componentKeysInInventory.add(sf.field_key);
  }

  const componentContext = settings.componentInjectionEnabled
    ? {
      primary: resolveKeyComponentRelation({ fieldKey, fieldRule, componentRelationIndex }),
      passengers: passengers.map((p) => resolveKeyComponentRelation({
        fieldKey: p.fieldKey, fieldRule: p.fieldRule, componentRelationIndex,
      })),
    }
    : { primary: null, passengers: passengers.map(() => null) };

  let knownFields = {};
  if (settings.knownFieldsInjectionEnabled) {
    const exclude = new Set([
      fieldKey,
      ...passengers.map((p) => p.fieldKey),
      ...componentKeysInInventory,
    ]);
    knownFields = readKnownFieldsByProduct({
      specDb, productId: product.product_id,
      compiledRulesFields: engine.rules, excludeFieldKeys: exclude,
    });
  }

  const injectionKnobs = {
    componentInjectionEnabled: settings.componentInjectionEnabled,
    knownFieldsInjectionEnabled: settings.knownFieldsInjectionEnabled,
    searchHintsInjectionEnabled: settings.searchHintsInjectionEnabled,
  };
  const domainArgs = {
    product,
    primary: { fieldKey, fieldRule },
    passengers,
    knownFields,
    componentContext,
    productComponents,
    injectionKnobs,
    category: product.category,
    variantCount,
    familyModelCount,
    siblingsExcluded,
    ambiguityLevel,
    previousDiscovery: { urlsChecked, queriesRun },
    templateOverride: settings.discoveryPromptTemplate,
  };

  const systemPrompt = buildKeyFinderPrompt(domainArgs);
  const userMessage = JSON.stringify({
    brand: product.brand || '',
    model: product.model || product.base_model || '',
    primary_field_key: fieldKey,
    passenger_count: passengers.length,
    variant_count: variantCount,
  });

  const policy = { keyFinderTiers: config.keyFinderTiers, models: { plan: config.llmModelPlan || '' } };
  const tierBundle = resolvePhaseModelByTier(policy, fieldRule.difficulty);

  const modelInfo = {
    id: tierBundle.model || String(config.llmModelPlan || 'unknown'),
    thinking_effort: tierBundle.thinkingEffort || '',
    web_search: Boolean(tierBundle.webSearch),
    json_strict: config._resolvedKeyFinderJsonStrict !== false,
  };

  const passengerKeys = passengers.map((p) => p.fieldKey);
  const notes = [
    `tier: ${fieldRule.difficulty || 'medium'}`,
    `bundling_enabled: ${settings.bundlingEnabled}`,
    `passenger_policy: ${settings.passengerDifficultyPolicy}`,
    `passengers: [${passengerKeys.join(', ') || '—'}]`,
  ];
  const label = passengerKeys.length === 0
    ? fieldKey
    : `${fieldKey} + ${passengerKeys.length} passenger${passengerKeys.length === 1 ? '' : 's'}`;

  return {
    finder: 'key',
    mode,
    compiled_at: Date.now(),
    prompts: [{
      label,
      system: systemPrompt,
      user: userMessage,
      schema: zodToLlmSchema(keyFinderResponseSchema),
      model: modelInfo,
      notes,
    }],
    inputs_resolved: {
      field_key: fieldKey,
      tier: fieldRule.difficulty || 'medium',
      variant_count: variantCount,
      family_model_count: familyModelCount,
      ambiguity_level: ambiguityLevel,
      bundling: {
        enabled: settings.bundlingEnabled,
        group_only: settings.groupBundlingOnly,
        policy: settings.passengerDifficultyPolicy,
        pool_per_primary: settings.bundlingPoolPerPrimary,
        passenger_cost: settings.bundlingPassengerCost,
        passenger_variant_cost_per_extra: settings.bundlingPassengerVariantCostPerExtra,
      },
      passenger_field_keys: passengerKeys,
    },
    notes: [],
  };
}
