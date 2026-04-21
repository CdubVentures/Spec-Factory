/**
 * Key Finder — universal per-key orchestrator (product-scoped).
 *
 * One call = one (product, fieldKey) pair → one LLM call → one publisher
 * submission. Phase 3a Part 2 ships Run mode only. Loop (Phase 3b),
 * passengers/bundling (Phase 5), and the dashboard (Phase 4) are deferred.
 *
 * Differences from variantScalarFieldProducer (RDF / SKU):
 *   - No variant iteration — `variantId: null` on candidate submission
 *   - fieldKey resolved from POST body (not a static registry array)
 *   - Tier model routing via resolvePhaseModelByTier(policy, fieldRule.difficulty)
 *   - Response is a multi-key envelope; solo mode parses only the primary
 */
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import { resolvePhaseModelByTier } from '../../core/llm/client/routing.js';
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { submitCandidate as defaultSubmitCandidate } from '../publisher/index.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { FieldRulesEngine } from '../../engine/fieldRulesEngine.js';

import { keyFinderResponseSchema } from './keySchema.js';
import { readKeyFinder, mergeKeyFinderDiscovery } from './keyStore.js';
import {
  buildKeyFinderPrompt,
  createKeyFinderCallLlm,
} from './keyLlmAdapter.js';

const VALID_TIERS = new Set(['easy', 'medium', 'hard', 'very_hard']);

function normalizeTierName(difficulty) {
  const raw = String(difficulty || '').trim();
  return VALID_TIERS.has(raw) ? raw : 'medium';
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

async function resolveIdentityForPrompt({ config, product, specDb, logger }) {
  // WHY: Identity ambiguity shapes the warning strength in the prompt.
  // A best-effort lookup — failures degrade to 'easy' ambiguity and don't
  // block the run.
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

/**
 * Orchestrate a single keyFinder LLM call for one (product, fieldKey) pair.
 *
 * @param {object} opts
 * @param {object} opts.product            product row (brand, model, base_model, category, product_id)
 * @param {string} opts.fieldKey           field_key to extract
 * @param {string} opts.category           category ('mouse' | 'keyboard' | ...)
 * @param {object} opts.specDb             per-category SpecDb
 * @param {object|null} [opts.appDb]       app DB (componentDb, known values)
 * @param {object} [opts.config]           runtime settings
 * @param {object} [opts.policy]           hydrated policy with keyFinderTiers (optional; defaults to config-derived)
 * @param {Function|null} [opts.broadcastWs]
 * @param {AbortSignal} [opts.signal]
 * @param {object} [opts.logger]
 * @param {string} [opts.productRoot]
 * @param {Function|null} [opts._callLlmOverride]       test seam
 * @param {Function|null} [opts._submitCandidateOverride] test seam
 * @returns {Promise<{status:string, run_number:number, field_key:string, tier:string, candidate?:object, publisher_error?:string, unknown_reason?:string}>}
 */
export async function runKeyFinder(opts) {
  const {
    product, fieldKey, category,
    specDb, appDb = null, config = {},
    policy: explicitPolicy = null,
    broadcastWs = null, signal, logger = null,
    productRoot,
    _callLlmOverride = null,
    _submitCandidateOverride = null,
  } = opts;

  const submitCandidate = _submitCandidateOverride ?? defaultSubmitCandidate;
  const resolvedProductRoot = productRoot || defaultProductRoot();

  if (!fieldKey) throw new Error('runKeyFinder: fieldKey is required');
  if (isReservedFieldKey(fieldKey)) {
    throw new Error(`reserved_field_key: ${fieldKey} is owned by another finder and cannot be run through keyFinder`);
  }

  // 1. Field-rule lookup
  const engine = await FieldRulesEngine.create(category, { specDb });
  const fieldRule = engine.rules?.[fieldKey];
  if (!fieldRule) {
    throw new Error(`missing_field_rule: no compiled field rule for "${fieldKey}" in category "${category}"`);
  }

  // 2. Settings (per-category)
  const finderStore = specDb.getFinderStore?.('keyFinder') ?? null;
  const settings = {
    discoveryPromptTemplate: readKnob(finderStore, 'discoveryPromptTemplate'),
    urlHistoryEnabled: readBoolKnob(finderStore, 'urlHistoryEnabled', true),
    queryHistoryEnabled: readBoolKnob(finderStore, 'queryHistoryEnabled', true),
    componentInjectionEnabled: readBoolKnob(finderStore, 'componentInjectionEnabled', true),
    knownFieldsInjectionEnabled: readBoolKnob(finderStore, 'knownFieldsInjectionEnabled', true),
    searchHintsInjectionEnabled: readBoolKnob(finderStore, 'searchHintsInjectionEnabled', true),
    budgetRequiredPoints: parseJsonSetting(readKnob(finderStore, 'budgetRequiredPoints'), { mandatory: 2, non_mandatory: 1 }),
    budgetAvailabilityPoints: parseJsonSetting(readKnob(finderStore, 'budgetAvailabilityPoints'), { always: 1, sometimes: 2, rare: 3 }),
    budgetDifficultyPoints: parseJsonSetting(readKnob(finderStore, 'budgetDifficultyPoints'), { easy: 1, medium: 2, hard: 3, very_hard: 4 }),
    budgetVariantPointsPerExtra: parseInt(readKnob(finderStore, 'budgetVariantPointsPerExtra') || '1', 10) || 1,
    budgetFloor: parseInt(readKnob(finderStore, 'budgetFloor') || '3', 10) || 3,
  };

  // 3. Tier resolution — policy defaults to config's hydrated keyFinderTiers
  const policy = explicitPolicy
    || { keyFinderTiers: config.keyFinderTiers, models: { plan: config.llmModelPlan || '' } };
  const tierBundle = resolvePhaseModelByTier(policy, fieldRule.difficulty);
  const tierName = normalizeTierName(fieldRule.difficulty);

  // 4. Variant count (for budget + prompt context)
  const activeVariants = specDb?.variants?.listActive?.(product.product_id) || [];
  const variantCount = activeVariants.length > 0 ? activeVariants.length : 1;

  // 5. Previous-run discovery (scoped per-key via runMatcher)
  const previousDoc = readKeyFinder({ productId: product.product_id, productRoot: resolvedProductRoot });
  const previousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];
  const { urlsChecked, queriesRun } = accumulateDiscoveryLog(previousRuns, {
    runMatcher: (r) => r?.response?.primary_field_key === fieldKey,
    includeUrls: settings.urlHistoryEnabled,
    includeQueries: settings.queryHistoryEnabled,
  });

  // 6. Identity ambiguity (best-effort, non-fatal)
  const { familyModelCount, ambiguityLevel, siblingsExcluded } =
    await resolveIdentityForPrompt({ config, product, specDb, logger });

  // 7. Build prompt
  const injectionKnobs = {
    componentInjectionEnabled: settings.componentInjectionEnabled,
    knownFieldsInjectionEnabled: settings.knownFieldsInjectionEnabled,
    searchHintsInjectionEnabled: settings.searchHintsInjectionEnabled,
  };
  const domainArgs = {
    product,
    primary: { fieldKey, fieldRule },
    passengers: [],
    knownFields: {},
    componentContext: { primary: null, passengers: [] },
    injectionKnobs,
    category,
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
    passenger_count: 0,
    variant_count: variantCount,
  });

  // 8. Invoke LLM (test seam vs production factory)
  const callStartedAt = new Date().toISOString();
  const callStartMs = Date.now();
  const mapped = {
    reason: `key_finding_${tierName}`,
    ...(tierBundle.model ? { modelOverride: tierBundle.model } : {}),
  };

  let llmResult;
  if (_callLlmOverride) {
    const r = await _callLlmOverride(domainArgs, mapped);
    llmResult = r?.result;
  } else {
    const llmDeps = buildLlmCallDeps({
      config, logger, signal,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });
    const callLlm = createKeyFinderCallLlm(llmDeps, { name: tierName, ...tierBundle });
    const r = await callLlm(domainArgs);
    llmResult = r?.result;
  }
  const durationMs = Date.now() - callStartMs;

  // 9. Validate multi-key envelope
  const parsed = keyFinderResponseSchema.parse(llmResult);
  if (parsed.primary_field_key !== fieldKey) {
    throw new Error(`llm_primary_mismatch: expected ${fieldKey}, got ${parsed.primary_field_key}`);
  }
  const perKey = parsed.results[fieldKey];
  const isUnknown = perKey?.value === 'unk' || perKey?.value === undefined;

  // 10. Publisher submission (skipped for honest unk)
  let submitResult = null;
  let publisherError = null;
  if (!isUnknown && Array.isArray(perKey.evidence_refs) && perKey.evidence_refs.length > 0) {
    try {
      submitResult = await submitCandidate({
        category: product.category,
        productId: product.product_id,
        fieldKey,
        value: perKey.value,
        confidence: perKey.confidence,
        sourceMeta: {
          source: 'key_finder',
          source_type: 'feature',
          tier: tierName,
          run_number: (previousDoc?.next_run_number || 1),
          model: tierBundle.model || config.llmModelPlan || '',
        },
        fieldRules: engine.rules,
        knownValues: engine.knownValues ?? null,
        componentDb: appDb?.componentDb ?? null,
        specDb,
        productRoot: resolvedProductRoot,
        metadata: {
          evidence_refs: perKey.evidence_refs,
          llm_access_mode: 'api',
          llm_thinking: tierBundle.thinking,
          llm_web_search: tierBundle.webSearch,
          llm_effort_level: tierBundle.thinkingEffort || '',
        },
        appDb,
        config,
        variantId: null, // product-scoped
        verifyEvidenceUrls: config.verifyEvidenceUrls,
        strictEvidence: config.strictEvidence,
      });
    } catch (err) {
      publisherError = err?.message || String(err);
      logger?.error?.('kf_publisher_submit_failed', { product_id: product.product_id, field_key: fieldKey, error: publisherError });
    }
  }

  // 11. Persist run record → JSON + SQL
  const merged = mergeKeyFinderDiscovery({
    productId: product.product_id,
    productRoot: resolvedProductRoot,
    newDiscovery: { category: product.category, last_ran_at: callStartedAt },
    run: {
      started_at: callStartedAt,
      duration_ms: durationMs,
      model: tierBundle.model || config.llmModelPlan || 'unknown',
      fallback_used: false,
      thinking: tierBundle.thinking,
      web_search: tierBundle.webSearch,
      effort_level: tierBundle.thinkingEffort || '',
      access_mode: 'api',
      selected: { keys: { [fieldKey]: perKey || { value: 'unk' } } },
      prompt: { system: systemPrompt, user: userMessage },
      response: parsed,
    },
  });
  const runNumber = merged.runs[merged.runs.length - 1].run_number;

  if (finderStore?.insertRun) {
    const latestRun = merged.runs[merged.runs.length - 1];
    finderStore.insertRun({
      category: product.category,
      product_id: product.product_id,
      run_number: runNumber,
      ran_at: callStartedAt,
      started_at: callStartedAt,
      duration_ms: durationMs,
      model: tierBundle.model || config.llmModelPlan || 'unknown',
      fallback_used: false,
      effort_level: tierBundle.thinkingEffort || '',
      access_mode: 'api',
      thinking: tierBundle.thinking,
      web_search: tierBundle.webSearch,
      selected: latestRun.selected,
      prompt: latestRun.prompt,
      response: latestRun.response,
    });
  }

  if (finderStore?.upsert) {
    finderStore.upsert({
      category: product.category,
      product_id: product.product_id,
      last_run_id: runNumber,
      cooldown_until: '',
      latest_ran_at: callStartedAt,
      run_count: merged.run_count,
    });
  }

  const status = isUnknown ? 'unk' : (publisherError ? 'accepted' : (submitResult?.status || 'accepted'));
  return {
    status,
    run_number: runNumber,
    field_key: fieldKey,
    tier: tierName,
    candidate: isUnknown ? null : {
      value: perKey.value,
      confidence: perKey.confidence,
      evidence_refs: perKey.evidence_refs,
    },
    ...(publisherError ? { publisher_error: publisherError } : {}),
    ...(isUnknown ? { unknown_reason: perKey?.unknown_reason || '' } : {}),
  };
}
