/**
 * variantScalarFieldProducer — shared orchestrator for per-variant scalar field finders.
 *
 * A "scalar field finder" produces ONE scalar value + confidence + evidence
 * per variant (e.g. release_date, sku, pricing, discontinued, msrp, upc).
 * The common shape:
 *   setup → per-variant LLM call → extract candidate → publisher submit → persist
 * is factored out here so each module supplies only the bespoke bits:
 *   - prompt template + LLM caller
 *   - response schema + extraction
 *   - satisfaction predicate for the loop
 *   - JSON store merge/read + recalculation formula
 *
 * Produces two orchestrators: `runOnce` (single-shot) and `runLoop`
 * (budget-bounded retries using shared `variantFieldLoop`).
 *
 * NOT for: CEF (variant generator — no per-variant loop) or PIF (multi-asset
 * image collector — different output shape). Those remain bespoke.
 */

import { buildLlmCallDeps } from '../llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import {
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from './finderOrchestrationHelpers.js';
import { runPerVariant } from './runPerVariant.js';
import { runVariantFieldLoop } from './variantFieldLoop.js';
import { resolveIdentityAmbiguitySnapshot } from '../../features/indexing/orchestration/shared/identityHelpers.js';
import { submitCandidate } from '../../features/publisher/index.js';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';
import {
  resolveScalarFinderPromptInputs,
  resolveScalarPreviousDiscovery,
  defaultBuildScalarUserMessage,
} from './resolveScalarFinderPromptInputs.js';

function defaultSuppressionScope(variant) {
  return { variant_id: variant.variant_id || '', mode: '' };
}

/**
 * @param {object} cfg
 * @param {string} cfg.finderName        — SpecDb finder-store key + phase tracking key (e.g. 'releaseDateFinder')
 * @param {string} cfg.fieldKey          — field rule key (e.g. 'release_date')
 * @param {string} cfg.sourceType        — publisher source_type (e.g. 'release_date_finder')
 * @param {string} cfg.phase             — LLM phase id (usually equal to finderName)
 * @param {string} cfg.responseValueKey  — key on run.response that carries the scalar (e.g. 'release_date')
 * @param {string} cfg.logPrefix         — prefix on logger event names (e.g. 'rdf')
 * @param {Function} cfg.createCallLlm   — (llmDeps) => callLlm  (feature's LLM caller factory)
 * @param {Function} cfg.buildPrompt     — (domainArgs) => systemPrompt string (for onLlmCallComplete emission)
 * @param {Function} cfg.extractCandidate — (llmResult) => { value, confidence, unknownReason, evidenceRefs, discoveryLog, isUnknown }
 * @param {Function} cfg.mergeDiscovery   — (opts) => merged doc  (feature's JSON store merge)
 * @param {Function} cfg.readRuns         — (opts) => doc  (feature's JSON store read)
 * @param {Function} cfg.satisfactionPredicate — (produceResult) => boolean  (loop stop)
 * @param {Function} [cfg.buildPublisherMetadata] — (variant, candidate, ctx, extracted) => metadata
 * @param {Function} [cfg.buildUserMessage]        — (product, variant) => string
 * @param {Function} [cfg.suppressionScope]        — (variant) => { variant_id, mode }
 * @param {number}   [cfg.defaultStaggerMs=1000]
 * @returns {{ runOnce, runLoop }}
 */
export function createVariantScalarFieldProducer(cfg) {
  const {
    finderName, fieldKey, sourceType, phase, responseValueKey, logPrefix,
    createCallLlm, buildPrompt, extractCandidate,
    mergeDiscovery, readRuns, satisfactionPredicate,
    buildPublisherMetadata,
    buildUserMessage = defaultBuildScalarUserMessage,
    suppressionScope = defaultSuppressionScope,
    defaultStaggerMs = 1000,
  } = cfg;

  async function setupRun({
    product, appDb, specDb, config = {}, logger = null,
    productRoot, variantKey = null, _callLlmOverride = null,
    onStageAdvance = null, onModelResolved = null, onStreamChunk = null,
    onQueueWait = null, onLlmCallComplete = null, signal,
  }) {
    const resolvedProductRoot = productRoot || defaultProductRoot();

    const _mt = resolveModelTracking({ config, phaseKey: phase, onModelResolved });
    const wrappedOnModelResolved = _mt.wrappedOnModelResolved;

    const finderStore = specDb.getFinderStore(finderName);
    const promptOverride = finderStore?.getSetting?.('discoveryPromptTemplate') || '';
    const urlHistoryEnabled = finderStore?.getSetting?.('urlHistoryEnabled') === 'true';
    const queryHistoryEnabled = finderStore?.getSetting?.('queryHistoryEnabled') === 'true';

    const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
      config, category: product.category, brand: product.brand,
      baseModel: product.base_model, currentModel: product.model,
      specDb, resolveFn: resolveIdentityAmbiguitySnapshot, logger,
    });

    const siblingsExcluded = [];
    for (const m of siblingModels) {
      if (m && !siblingsExcluded.includes(m)) siblingsExcluded.push(m);
    }

    const dbVariantsPre = specDb.variants?.listActive(product.product_id) || [];
    if (dbVariantsPre.length === 0) {
      return {
        earlyReject: {
          rejected: true,
          rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }],
          candidates: [],
        },
      };
    }
    if (variantKey && !dbVariantsPre.some((v) => v.variant_key === variantKey)) {
      return {
        earlyReject: {
          rejected: true,
          rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }],
          candidates: [],
        },
      };
    }

    // WHY: Canonical shape matches runPerVariant's transformation so the
    // sibling-variants helper can filter by `.key`. Loaded once here and
    // threaded through ctx to each produceForVariant call.
    const allVariants = dbVariantsPre.map((v) => ({
      variant_id: v.variant_id,
      key: v.variant_key,
      label: v.variant_label,
      type: v.variant_type,
    }));

    const llmDeps = buildLlmCallDeps({
      config, logger,
      onPhaseChange: onStageAdvance ? (p) => { if (p === 'writer') onStageAdvance('Writer'); } : undefined,
      onModelResolved: wrappedOnModelResolved,
      onStreamChunk,
      onQueueWait,
      signal,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });
    const callLlm = buildFinderLlmCaller({
      _callLlmOverride,
      wrappedOnModelResolved,
      createCallLlm,
      llmDeps,
    });

    const compiled = specDb.getCompiledRules?.();
    const fieldRules = compiled?.fields || null;
    const ranAt = new Date().toISOString();
    // WHY: Run-scoped HEAD-check cache — dedupes evidence URL verification
    // across all variants submitted in this run. A URL that repeats across
    // variants (common for tier1 manufacturer pages) is fetched once.
    const evidenceCache = new Map();

    return {
      ctx: {
        product,
        productRoot: resolvedProductRoot,
        specDb, appDb, config, logger,
        callLlm, fieldRules,
        urlHistoryEnabled, queryHistoryEnabled,
        siblingsExcluded, familyModelCount, ambiguityLevel,
        _mt, ranAt,
        onLlmCallComplete,
        promptOverride,
        evidenceCache,
        allVariants,
      },
      _mt,
      finderStore,
    };
  }

  function buildProduceForVariant(ctx, previousRunsProvider) {
    const {
      product, productRoot, specDb, appDb, config, logger,
      callLlm, fieldRules,
      urlHistoryEnabled, queryHistoryEnabled,
      siblingsExcluded, familyModelCount, ambiguityLevel,
      _mt, ranAt,
      onLlmCallComplete, promptOverride,
      evidenceCache,
      allVariants,
    } = ctx;

    return async function produceForVariant(variant, _i, callCtx = {}) {
      const loopId = callCtx?.loopId || null;
      const previousRuns = previousRunsProvider();

      const scope = suppressionScope(variant);
      const featureStore = specDb.getFinderStore(finderName);
      const suppRows = (featureStore?.listSuppressions?.(product.product_id) || [])
        .filter((s) => s.variant_id === scope.variant_id && s.mode === scope.mode);
      const previousDiscovery = resolveScalarPreviousDiscovery({
        previousRuns, variant, urlHistoryEnabled, queryHistoryEnabled, suppRows,
      });

      const { domainArgs, userMessage: userMsg } = resolveScalarFinderPromptInputs({
        product, variant, allVariants,
        siblingsExcluded, familyModelCount, ambiguityLevel,
        previousDiscovery, promptOverride,
        buildUserMessage,
      });

      const systemPrompt = buildPrompt(domainArgs);

      const callStartedAt = new Date().toISOString();
      const callStartMs = Date.now();

      onLlmCallComplete?.({
        prompt: { system: systemPrompt, user: userMsg },
        response: null,
        model: _mt.actualModel,
        isFallback: _mt.actualFallbackUsed,
        thinking: _mt.actualThinking,
        webSearch: _mt.actualWebSearch,
        effortLevel: _mt.actualEffortLevel,
        accessMode: _mt.actualAccessMode,
        variant: variant.label,
        label: 'Discovery',
      });

      let llmResult, usage;
      try {
        const r = await callLlm(domainArgs);
        llmResult = r.result;
        usage = r.usage;
      } catch (err) {
        logger?.error?.(`${logPrefix}_llm_failed`, {
          product_id: product.product_id, variant: variant.key, error: err.message,
        });
        return { error: err.message, candidate: null, persisted: false };
      }

      const durationMs = Date.now() - callStartMs;
      const extracted = extractCandidate(llmResult);
      const { value, confidence, unknownReason, evidenceRefs, discoveryLog, isUnknown } = extracted;

      const candidateEntry = {
        variant_id: variant.variant_id || null,
        variant_key: variant.key,
        variant_label: variant.label,
        variant_type: variant.type,
        value: isUnknown ? '' : value,
        confidence,
        unknown_reason: isUnknown ? unknownReason : '',
        sources: evidenceRefs.map((e) => ({
          url: String(e.url || ''),
          tier: String(e.tier || 'unknown'),
          confidence: Number.isFinite(e.confidence) ? e.confidence : 0,
          ...(typeof e.supporting_evidence === 'string' ? { supporting_evidence: e.supporting_evidence } : {}),
          ...(typeof e.evidence_kind === 'string' ? { evidence_kind: e.evidence_kind } : {}),
        })),
        ran_at: ranAt,
      };

      const responsePayload = {
        started_at: callStartedAt,
        duration_ms: durationMs,
        variant_id: variant.variant_id || null,
        variant_key: variant.key,
        variant_label: variant.label,
        [responseValueKey]: value,
        confidence,
        unknown_reason: unknownReason,
        evidence_refs: evidenceRefs,
        discovery_log: discoveryLog || { urls_checked: [], queries_run: [], notes: [] },
        ...(loopId ? { loop_id: loopId } : {}),
      };

      onLlmCallComplete?.({
        prompt: { system: systemPrompt, user: userMsg },
        response: responsePayload,
        model: _mt.actualModel,
        isFallback: _mt.actualFallbackUsed,
        thinking: _mt.actualThinking,
        webSearch: _mt.actualWebSearch,
        effortLevel: _mt.actualEffortLevel,
        accessMode: _mt.actualAccessMode,
        variant: variant.label,
        usage,
        label: 'Discovery',
      });

      let publishResult = null;
      if (!isUnknown && fieldRules && evidenceRefs.length > 0) {
        try {
          const metadata = buildPublisherMetadata
            ? buildPublisherMetadata(variant, candidateEntry, ctx, extracted)
            : {
              variant_key: variant.key,
              variant_label: variant.label,
              variant_type: variant.type,
              evidence_refs: evidenceRefs,
              llm_access_mode: _mt.actualAccessMode || 'api',
              llm_thinking: _mt.actualThinking,
              llm_web_search: _mt.actualWebSearch,
              llm_effort_level: _mt.actualEffortLevel || '',
            };

          const submitResult = await submitCandidate({
            category: product.category,
            productId: product.product_id,
            fieldKey,
            value,
            confidence,
            sourceMeta: {
              source: sourceType,
              source_type: 'feature',
              model: _mt.actualModel,
            },
            fieldRules,
            knownValues: null,
            componentDb: null,
            specDb,
            productRoot,
            metadata,
            appDb,
            config,
            variantId: variant.variant_id || null,
            evidenceCache,
          });
          publishResult = submitResult;
          if (submitResult?.status === 'rejected') {
            candidateEntry.rejected_by_gate = true;
            candidateEntry.rejection_reasons = submitResult.validationResult?.rejections || [];
          }
        } catch (err) {
          logger?.error?.(`${logPrefix}_publisher_submit_failed`, {
            product_id: product.product_id, variant: variant.key, error: err.message,
          });
          candidateEntry.publisher_error = err.message;
        }
      }

      const selected = { candidates: [candidateEntry] };
      const merged = mergeDiscovery({
        productId: product.product_id,
        productRoot,
        newDiscovery: { category: product.category, last_ran_at: ranAt },
        run: {
          started_at: callStartedAt,
          duration_ms: durationMs,
          model: _mt.actualModel,
          fallback_used: _mt.actualFallbackUsed,
          effort_level: _mt.actualEffortLevel,
          access_mode: _mt.actualAccessMode,
          thinking: _mt.actualThinking,
          web_search: _mt.actualWebSearch,
          selected,
          prompt: { system: systemPrompt, user: userMsg },
          response: responsePayload,
        },
      });

      const store = specDb.getFinderStore(finderName);
      const latestRun = merged.runs[merged.runs.length - 1];
      store.insertRun({
        category: product.category,
        product_id: product.product_id,
        run_number: latestRun.run_number,
        ran_at: ranAt,
        model: _mt.actualModel,
        fallback_used: _mt.actualFallbackUsed,
        effort_level: _mt.actualEffortLevel,
        access_mode: _mt.actualAccessMode,
        thinking: _mt.actualThinking,
        web_search: _mt.actualWebSearch,
        selected,
        prompt: latestRun.prompt,
        response: latestRun.response,
      });

      store.upsert({
        category: product.category,
        product_id: product.product_id,
        candidates: merged.selected.candidates,
        candidate_count: merged.selected.candidates.length,
        latest_ran_at: ranAt,
        run_count: merged.run_count,
      });

      // WHY: publishResult is submitCandidate's return ({status:'accepted', ...,
      // publishResult: { status: 'published'|'below_threshold'|... }}). The loop
      // stops on the INNER gate decision — outer 'accepted' is not enough.
      const innerPublishStatus = publishResult?.publishResult?.status || 'skipped';
      return {
        candidate: candidateEntry,
        persisted: true,
        publishStatus: innerPublishStatus,
        published: innerPublishStatus === 'published',
      };
    };
  }

  function collectCandidatesAndErrors(perVariantResults) {
    const candidates = [];
    const errors = [];
    for (const { variant, result, error } of perVariantResults) {
      if (error) {
        errors.push({ variant_key: variant.key, error });
        continue;
      }
      if (result?.candidate) candidates.push(result.candidate);
    }
    return { candidates, errors };
  }

  async function runOnce(opts) {
    const { onStageAdvance = null, onVariantProgress = null, variantKey = null, logger = null } = opts;
    const setup = await setupRun(opts);
    if (setup.earlyReject) return setup.earlyReject;
    const { ctx, _mt } = setup;

    const previousDoc = readRuns({ productId: ctx.product.product_id, productRoot: ctx.productRoot });
    const staticPreviousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];
    const produceForVariant = buildProduceForVariant(ctx, () => staticPreviousRuns);

    const { rejected, rejections, perVariantResults, variants } = await runPerVariant({
      specDb: ctx.specDb, product: ctx.product, variantKey,
      staggerMs: defaultStaggerMs,
      onStageAdvance, onVariantProgress, logger,
      produceForVariant,
    });

    if (rejected) {
      return { rejected: true, rejections, candidates: [] };
    }

    const { candidates, errors } = collectCandidatesAndErrors(perVariantResults);
    onStageAdvance?.('Complete');

    return {
      rejected: false,
      variants_processed: variants.length,
      candidates,
      errors,
      fallbackUsed: _mt.actualFallbackUsed,
    };
  }

  async function runLoop(opts) {
    const {
      onStageAdvance = null, onVariantProgress = null, onLoopProgress = null,
      variantKey = null, logger = null,
    } = opts;
    const setup = await setupRun(opts);
    if (setup.earlyReject) return setup.earlyReject;
    const { ctx, _mt, finderStore } = setup;

    const perVariantAttemptBudget = parseInt(finderStore?.getSetting?.('perVariantAttemptBudget') || '1', 10) || 1;
    // WHY: Re-run budget governs a second Loop click on a variant the publisher
    // has already RESOLVED. 0 = skip (no LLM call). The SQL store hydrates the
    // registry default (1) when the key is unset, so parseInt sees '0' | '1' | ...
    const reRunBudget = parseInt(finderStore?.getSetting?.('reRunBudget') || '1', 10) || 0;

    const resolvedRows = ctx.specDb?.getFieldCandidatesByProductAndField?.(
      ctx.product.product_id, fieldKey,
    ) || [];
    const satisfiedVariantIds = new Set(
      resolvedRows
        .filter((r) => r.status === 'resolved')
        .map((r) => String(r.variant_id ?? '')),
    );
    const resolveBudget = (variant) => {
      const vid = String(variant.variant_id ?? '');
      return satisfiedVariantIds.has(vid) ? reRunBudget : perVariantAttemptBudget;
    };

    const previousRunsProvider = () => {
      const doc = readRuns({ productId: ctx.product.product_id, productRoot: ctx.productRoot });
      return Array.isArray(doc?.runs) ? doc.runs : [];
    };
    const produceForVariant = buildProduceForVariant(ctx, previousRunsProvider);

    const { rejected, rejections, perVariantResults, variants, loopId } = await runVariantFieldLoop({
      specDb: ctx.specDb,
      product: ctx.product,
      variantKey,
      resolveBudget,
      staggerMs: defaultStaggerMs,
      onStageAdvance, onVariantProgress, onLoopProgress,
      logger,
      produceForVariant,
      satisfactionPredicate,
    });

    if (rejected) {
      return { rejected: true, rejections, candidates: [], loopId };
    }

    const { candidates, errors } = collectCandidatesAndErrors(perVariantResults);
    onStageAdvance?.('Complete');

    return {
      rejected: false,
      variants_processed: variants.length,
      candidates,
      errors,
      fallbackUsed: _mt.actualFallbackUsed,
      loopId,
    };
  }

  return { runOnce, runLoop };
}
