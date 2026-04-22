/**
 * Key Finder — universal per-key orchestrator (product-scoped).
 *
 * One call = one (product, fieldKey) pair → one LLM call → one-or-more
 * publisher submissions (primary + optional passengers). Phase 4 dashboard
 * shipped 2026-04-21. Phase 4.5 wires bundling into Run + Loop (this file).
 * Phase 3b Loop orchestration is the next gate.
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
import { resolveModelTracking } from '../../core/finder/finderOrchestrationHelpers.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { submitCandidate as defaultSubmitCandidate } from '../publisher/index.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { FieldRulesEngine } from '../../engine/fieldRulesEngine.js';

import { keyFinderResponseSchema } from './keySchema.js';
import { readKeyFinder, mergeKeyFinderDiscovery } from './keyStore.js';
import { readFloatKnob } from './keyBudgetCalc.js';
import {
  buildKeyFinderPrompt,
  createKeyFinderCallLlm,
} from './keyLlmAdapter.js';
import { buildPassengers } from './keyPassengerBuilder.js';
import * as keyFinderRegistry from '../../core/operations/keyFinderRegistry.js';
import {
  buildComponentRelationIndex,
  resolveProductComponentInventory,
  resolveKeyComponentRelation,
  readKnownFieldsByProduct,
} from '../../core/finder/productResolvedStateReader.js';

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
 * @param {string|null} [opts.loop_id]     Phase 3b — stamped onto the persisted run's response.loop_id when present. Shared by every iteration of a single runKeyFinderLoop call.
 * @param {object|null} [opts.tierBundleOverride]  Phase 3b — when non-null, skip the internal resolvePhaseModelByTier call and use this bundle. Shape: { name, model, thinking, webSearch, thinkingEffort, useReasoning, reasoningModel }. Loop snapshots once at entry and threads here.
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
    loop_id = null,
    tierBundleOverride = null,
    mode = 'run',
    // WHY: Telemetry callbacks mirror finderRoutes/RDF/SKU. Drive the active-
    // operations panel (model name, stage transitions, LLM call log, lab queue
    // wait). When unset they're no-ops so test harnesses stay quiet.
    onStageAdvance = null,
    onModelResolved = null,
    onStreamChunk = null,
    onQueueWait = null,
    onPhaseChange = null,
    onLlmCallComplete = null,
    onPassengersRegistered = null,
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
    budgetVariantPointsPerExtra: readFloatKnob(readKnob(finderStore, 'budgetVariantPointsPerExtra'), 0.25),
    budgetFloor: parseInt(readKnob(finderStore, 'budgetFloor') || '3', 10) || 3,
    bundlingEnabled: readBoolKnob(finderStore, 'bundlingEnabled', false),
    alwaysSoloRun: readBoolKnob(finderStore, 'alwaysSoloRun', true),
    groupBundlingOnly: readBoolKnob(finderStore, 'groupBundlingOnly', true),
    bundlingPassengerCost: parseJsonSetting(readKnob(finderStore, 'bundlingPassengerCost'), { easy: 1, medium: 2, hard: 4, very_hard: 8 }),
    bundlingPoolPerPrimary: parseJsonSetting(readKnob(finderStore, 'bundlingPoolPerPrimary'), { easy: 6, medium: 4, hard: 2, very_hard: 1 }),
    passengerDifficultyPolicy: readKnob(finderStore, 'passengerDifficultyPolicy') || 'less_or_equal',
    bundlingOverlapCapEasy: parseInt(readKnob(finderStore, 'bundlingOverlapCapEasy') || '2', 10),
    bundlingOverlapCapMedium: parseInt(readKnob(finderStore, 'bundlingOverlapCapMedium') || '4', 10),
    bundlingOverlapCapHard: parseInt(readKnob(finderStore, 'bundlingOverlapCapHard') || '6', 10),
    bundlingOverlapCapVeryHard: parseInt(readKnob(finderStore, 'bundlingOverlapCapVeryHard') || '0', 10),
  };

  // 2.5 In-flight registry — register primary AFTER fail-fast validation so
  //     rejected calls don't pollute state. The matching release + passenger
  //     cleanup lives in the finally block at the end of the function. The try
  //     below intentionally does NOT re-indent the body — keeps this diff
  //     minimal and the block boundaries still read clearly.
  keyFinderRegistry.register(product.product_id, fieldKey, 'primary');
  const _registeredPassengerFks = [];
  try {

  // 3. Tier resolution — policy defaults to config's hydrated keyFinderTiers.
  //    When tierBundleOverride is present (Phase 3b Loop snapshot), skip the
  //    resolve call and use the pinned bundle instead so an LLM Config edit
  //    mid-loop doesn't split a single Loop across two models.
  const policy = explicitPolicy
    || { keyFinderTiers: config.keyFinderTiers, models: { plan: config.llmModelPlan || '' } };
  const tierBundle = tierBundleOverride
    ? { ...tierBundleOverride }
    : resolvePhaseModelByTier(policy, fieldRule.difficulty);
  const tierName = normalizeTierName(fieldRule.difficulty);

  // 4. Variant count (for budget + prompt context)
  const activeVariants = specDb?.variants?.listActive?.(product.product_id) || [];
  const variantCount = activeVariants.length > 0 ? activeVariants.length : 1;

  // 5. Previous-run discovery (scoped per-key via runMatcher)
  const previousDoc = readKeyFinder({ productId: product.product_id, productRoot: resolvedProductRoot });
  const previousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];
  const { urlsChecked, queriesRun } = accumulateDiscoveryLog(previousRuns, {
    // WHY: Broadened to include prior appearances as a passenger — after bundling,
    // a key may have resolved as a passenger in another primary's run. That run's
    // discovery_log IS the passenger's (per contract: passengers inherit primary
    // search session), so folding it into history prevents re-crawling URLs.
    runMatcher: (r) =>
      r?.response?.primary_field_key === fieldKey
      || (r?.response?.results && Object.prototype.hasOwnProperty.call(r.response.results, fieldKey)),
    includeUrls: settings.urlHistoryEnabled,
    includeQueries: settings.queryHistoryEnabled,
  });

  // 6. Identity ambiguity (best-effort, non-fatal)
  const { familyModelCount, ambiguityLevel, siblingsExcluded } =
    await resolveIdentityForPrompt({ config, product, specDb, logger });

  // 6.5 Passenger packing (bundling) — contract: §6.1 + §6.2 of
  // per-key-finder-roadmap.html. Per-key Run is always solo when
  // alwaysSoloRun=true (default) regardless of bundlingEnabled — that's the
  // focused-key-run contract. Loop-mode ignores the knob and always packs.
  const passengers = (settings.alwaysSoloRun && mode === 'run')
    ? []
    : buildPassengers({
      primary: { fieldKey, fieldRule },
      engineRules: engine.rules,
      specDb,
      productId: product.product_id,
      settings,
    });
  for (const p of passengers) {
    keyFinderRegistry.register(product.product_id, p.fieldKey, 'passenger');
    _registeredPassengerFks.push(p.fieldKey);
  }

  // 6.6 Stage 3 signal — passenger registration complete. Clients chaining
  // Run Group under alwaysSoloRun=false await this per-opId so the N-th POST
  // sees the (N-1)-th's passengers in the in-flight registry before computing
  // its own pack. Idempotent across Loop iterations (the registry helper
  // guards on the op.passengersRegistered flag).
  try {
    onPassengersRegistered?.(_registeredPassengerFks.slice());
  } catch (err) {
    logger?.warn?.('kf_on_passengers_registered_callback_failed', { error: err?.message || String(err) });
  }

  // 6.7 Context injection upstreams
  //  - PRODUCT_COMPONENTS inventory is unconditional (not gated by either knob).
  //  - Per-key relation pointer is gated by componentInjectionEnabled.
  //  - knownFields dump is gated by knownFieldsInjectionEnabled; the exclude
  //    set dedups against the primary + passengers (current query targets)
  //    AND against every field_key rendered in the inventory.
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
    // WHY: primary + passengers are the current query targets — the LLM is
    // being asked to resolve them, so they must never appear as "already
    // known" context. Component-inventory keys are deduped because they're
    // already emitted in {{PRODUCT_COMPONENTS}}.
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

  // 7. Build prompt
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
    passenger_count: passengers.length,
    variant_count: variantCount,
  });

  // 8. Invoke LLM (test seam vs production factory)
  onStageAdvance?.('Discovery');

  // WHY: Mirror CEF/RDF/SKU — modelTracking captures what callLlmWithRouting
  // actually resolved (including fallback usage, access mode, effort level).
  // The LLM-call log in the active-operations modal reads these fields to
  // render the model chip consistently with every other finder.
  const modelTracking = resolveModelTracking({ config, phaseKey: 'keyFinder', onModelResolved });

  // Initial values for the pending row — these reflect the tier bundle the
  // user configured. The completed emission below upserts this row (via
  // appendLlmCall's response===null → response!=null merge rule) with the
  // final values from modelTracking after the LLM call resolves.
  const initialModel = tierBundle.model || config.llmModelPlan || '';
  const tierCapabilities = {
    thinking: Boolean(tierBundle.thinking),
    webSearch: Boolean(tierBundle.webSearch),
    effortLevel: String(tierBundle.thinkingEffort || ''),
  };

  // WHY: Pending emit BEFORE the call — PIF/CEF/RDF pattern. Makes the call
  // row appear immediately with the system + user prompt visible, labeled
  // "Awaiting response..." until the completed emit upserts it. Without this,
  // the LLM-call list stays empty for the entire call duration and the user
  // can't see the prompt that's in flight.
  onLlmCallComplete?.({
    label: 'Discovery',
    prompt: { system: systemPrompt, user: userMessage },
    response: null,
    model: initialModel,
    isFallback: false,
    thinking: tierCapabilities.thinking,
    webSearch: tierCapabilities.webSearch,
    effortLevel: tierCapabilities.effortLevel,
    accessMode: '',
    tier: tierName,
    reason: `key_finding_${tierName}`,
  });

  const callStartedAt = new Date().toISOString();
  const callStartMs = Date.now();
  const mapped = {
    reason: `key_finding_${tierName}`,
    ...(tierBundle.model ? { modelOverride: tierBundle.model } : {}),
  };

  let llmResult;
  let llmUsage = null;
  if (_callLlmOverride) {
    const r = await _callLlmOverride(domainArgs, mapped);
    llmResult = r?.result;
    llmUsage = r?.usage || null;
  } else {
    const llmDeps = buildLlmCallDeps({
      config, logger, signal,
      onModelResolved: modelTracking.wrappedOnModelResolved,
      onStreamChunk, onQueueWait, onPhaseChange,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });
    const callLlm = createKeyFinderCallLlm(llmDeps, { name: tierName, ...tierBundle });
    const r = await callLlm(domainArgs);
    llmResult = r?.result;
    llmUsage = r?.usage || null;
  }
  const durationMs = Date.now() - callStartMs;

  // WHY: Completed emit — upserts the pending row via appendLlmCall (same label
  // + non-null response triggers the merge). Carries the final model-tracking
  // set + usage/cost so the modal can render token counts and cost metrics.
  onLlmCallComplete?.({
    label: 'Discovery',
    prompt: { system: systemPrompt, user: userMessage },
    response: llmResult,
    model: modelTracking.actualModel || initialModel,
    isFallback: modelTracking.actualFallbackUsed,
    thinking: modelTracking.actualThinking,
    webSearch: modelTracking.actualWebSearch,
    effortLevel: modelTracking.actualEffortLevel,
    accessMode: modelTracking.actualAccessMode,
    tier: tierName,
    reason: `key_finding_${tierName}`,
    usage: llmUsage,
    started_at: callStartedAt,
    duration_ms: durationMs,
  });

  // 9. Validate multi-key envelope
  onStageAdvance?.('Validate');
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
    onStageAdvance?.('Publish');
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

  // 10b. Passenger submissions — each passenger writes its own field_candidates
  // row (shares sourceMeta.run_number with primary so the run-delete cascade
  // can strip them together). Per contract: primary owns budget; passengers
  // ride free. "unk" / missing / empty-evidence passengers aren't submitted.
  const passengerCandidates = [];
  for (const p of passengers) {
    const pResult = parsed.results?.[p.fieldKey];
    if (!pResult) {
      passengerCandidates.push({ fieldKey: p.fieldKey, status: 'missing' });
      continue;
    }
    const pIsUnknown = pResult.value === 'unk' || pResult.value === undefined;
    if (pIsUnknown) {
      passengerCandidates.push({
        fieldKey: p.fieldKey,
        status: 'unk',
        unknown_reason: String(pResult.unknown_reason || ''),
      });
      continue;
    }
    const pEvidence = Array.isArray(pResult.evidence_refs) ? pResult.evidence_refs : [];
    if (pEvidence.length === 0) {
      passengerCandidates.push({ fieldKey: p.fieldKey, status: 'no_evidence' });
      continue;
    }
    try {
      const pSubmit = await submitCandidate({
        category: product.category,
        productId: product.product_id,
        fieldKey: p.fieldKey,
        value: pResult.value,
        confidence: pResult.confidence,
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
          evidence_refs: pEvidence,
          llm_access_mode: 'api',
          llm_thinking: tierBundle.thinking,
          llm_web_search: tierBundle.webSearch,
          llm_effort_level: tierBundle.thinkingEffort || '',
        },
        appDb,
        config,
        variantId: null,
        verifyEvidenceUrls: config.verifyEvidenceUrls,
        strictEvidence: config.strictEvidence,
      });
      passengerCandidates.push({
        fieldKey: p.fieldKey,
        status: pSubmit?.status || 'accepted',
        candidate: {
          value: pResult.value,
          confidence: pResult.confidence,
          evidence_refs: pEvidence,
        },
      });
    } catch (err) {
      const pErr = err?.message || String(err);
      logger?.error?.('kf_passenger_submit_failed', {
        product_id: product.product_id,
        field_key: p.fieldKey,
        primary_field_key: fieldKey,
        error: pErr,
      });
      passengerCandidates.push({
        fieldKey: p.fieldKey,
        status: 'error',
        publisher_error: pErr,
      });
    }
  }

  // 11. Persist run record → JSON + SQL. selected.keys stores primary + every
  // passenger answer, each with `rode_with` attribution (null for primary, the
  // primary's fieldKey for each passenger). Load-bearing for the delete cascade
  // and Phase 5 Group Loop skip logic.
  const selectedKeys = {
    [fieldKey]: { ...(perKey || { value: 'unk' }), rode_with: null },
  };
  for (const p of passengers) {
    const pResult = parsed.results?.[p.fieldKey];
    if (pResult) {
      selectedKeys[p.fieldKey] = { ...pResult, rode_with: fieldKey };
    }
  }

  // WHY: When called inside a Loop, stamp loop_id onto response so every run
  //   of a single loop call can be grouped (matches RDF's variantFieldLoop pattern).
  const persistedResponse = loop_id ? { ...parsed, loop_id } : parsed;
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
      selected: { keys: selectedKeys },
      prompt: { system: systemPrompt, user: userMessage },
      response: persistedResponse,
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
    passenger_candidates: passengerCandidates,
    ...(publisherError ? { publisher_error: publisherError } : {}),
    ...(isUnknown ? { unknown_reason: perKey?.unknown_reason || '' } : {}),
  };
  } finally {
    for (const fk of _registeredPassengerFks) {
      keyFinderRegistry.release(product.product_id, fk, 'passenger');
    }
    keyFinderRegistry.release(product.product_id, fieldKey, 'primary');
  }
}
