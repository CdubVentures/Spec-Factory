/**
 * Release Date Finder — variant-aware orchestrator.
 *
 * First `variantFieldProducer` module. Iterates CEF variants and runs one LLM
 * search per variant to discover the first-availability release date. Valid
 * candidates are submitted to the publisher gate via `submitCandidate()`; the
 * publisher validates evidence (min_evidence_refs, tier_preference) before
 * promoting to `fields.release_date`.
 *
 * Per-variant candidates are also projected to the `release_date_finder` SQL
 * table for fast UI GET (no product-level field_rules pollution).
 *
 * Exports:
 *   - runReleaseDateFinder: single-shot per-variant (Run / Run All)
 *   - runReleaseDateFinderLoop: retries per variant up to perVariantAttemptBudget
 *     until the candidate reaches the publisher gate or LLM returns definitive
 *     unknown (Loop / Loop All). Standardized for all variantFieldProducers
 *     via src/core/finder/variantFieldLoop.js.
 */

import path from 'node:path';
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import {
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from '../../core/finder/finderOrchestrationHelpers.js';
import { runPerVariant } from '../../core/finder/runPerVariant.js';
import { runVariantFieldLoop } from '../../core/finder/variantFieldLoop.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { submitCandidate } from '../publisher/index.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import {
  readReleaseDates,
  mergeReleaseDateDiscovery,
} from './releaseDateStore.js';
import {
  createReleaseDateFinderCallLlm,
  buildReleaseDateFinderPrompt,
} from './releaseDateLlmAdapter.js';

/**
 * Shared setup for single-run and loop orchestrators. Short-circuits with an
 * earlyReject payload when CEF hasn't produced variants yet, or when the
 * requested variantKey doesn't match. Otherwise returns the full context
 * object consumed by buildProduceForVariant.
 */
async function setupReleaseDateFinderRun({
  product, appDb, specDb, config = {}, logger = null,
  productRoot, variantKey = null, _callLlmOverride = null,
  onStageAdvance = null, onModelResolved = null, onStreamChunk = null,
  onQueueWait = null, onLlmCallComplete = null, signal,
}) {
  const resolvedProductRoot = productRoot || defaultProductRoot();

  const _mt = resolveModelTracking({ config, phaseKey: 'releaseDateFinder', onModelResolved });
  const wrappedOnModelResolved = _mt.wrappedOnModelResolved;

  const finderStore = specDb.getFinderStore('releaseDateFinder');
  const promptOverride = finderStore?.getSetting?.('discoveryPromptTemplate') || '';
  const minConfidence = parseInt(finderStore?.getSetting?.('minConfidence') || '70', 10) || 70;
  const urlHistoryEnabled = finderStore?.getSetting?.('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore?.getSetting?.('queryHistoryEnabled') === 'true';

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
  });

  // Sibling exclusion from CEF runs (identity context)
  const cefPath = path.join(resolvedProductRoot, product.product_id, 'color_edition.json');
  let cefData;
  try { cefData = JSON.parse(fs.readFileSync(cefPath, 'utf8')); } catch { cefData = null; }

  const siblingsExcluded = [];
  for (const run of (cefData?.runs || [])) {
    for (const s of (run.response?.siblings_excluded || run.selected?.siblings_excluded || [])) {
      if (s && !siblingsExcluded.includes(s)) siblingsExcluded.push(s);
    }
  }
  for (const m of siblingModels) {
    if (m && !siblingsExcluded.includes(m)) siblingsExcluded.push(m);
  }

  // Pre-check variants before building LLM caller (mirrors PIF short-circuit)
  const dbVariantsPre = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariantsPre.length === 0) {
    return { earlyReject: { rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }], candidates: [] } };
  }
  if (variantKey && !dbVariantsPre.some((v) => v.variant_key === variantKey)) {
    return { earlyReject: { rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }], candidates: [] } };
  }

  // Build LLM caller
  const llmDeps = buildLlmCallDeps({
    config, logger,
    onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
    onModelResolved: wrappedOnModelResolved,
    onStreamChunk,
    onQueueWait,
    signal,
    onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
  });
  const callLlm = buildFinderLlmCaller({
    _callLlmOverride,
    wrappedOnModelResolved,
    createCallLlm: createReleaseDateFinderCallLlm,
    llmDeps,
  });

  // WHY: Source field rules from specDb (compiled SSOT) — same pattern as CEF.
  // Reading files directly risks path drift and bypasses the compile pipeline.
  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || null;
  const ranAt = new Date().toISOString();

  return {
    ctx: {
      product,
      productRoot: resolvedProductRoot,
      specDb, appDb, config, logger,
      callLlm, fieldRules,
      minConfidence, urlHistoryEnabled, queryHistoryEnabled,
      siblingsExcluded, familyModelCount, ambiguityLevel,
      _mt, ranAt,
      onLlmCallComplete,
      promptOverride,
    },
    _mt,
    finderStore,
  };
}

/**
 * Factory for the per-variant produce closure. Accepts a previousRunsProvider
 * so callers can choose between a frozen snapshot (single-run) and a fresh
 * disk read per attempt (loop, so retries accumulate URL/query history).
 */
function buildProduceForVariant(ctx, previousRunsProvider) {
  const {
    product, productRoot, specDb, appDb, config, logger,
    callLlm, fieldRules,
    minConfidence, urlHistoryEnabled, queryHistoryEnabled,
    siblingsExcluded, familyModelCount, ambiguityLevel,
    _mt, ranAt,
    onLlmCallComplete, promptOverride,
  } = ctx;

  return async function produceForVariant(variant, _i, callCtx = {}) {
    const loopId = callCtx?.loopId || null;
    const previousRuns = previousRunsProvider();
    // RDF is variant-scoped → suppressions filter to variant_id==variant.variant_id && mode==''.
    const rdfStore = specDb.getFinderStore('releaseDateFinder');
    const rdfSuppRows = (rdfStore?.listSuppressions?.(product.product_id) || [])
      .filter((s) => s.variant_id === (variant.variant_id || '') && s.mode === '');
    const previousDiscovery = accumulateDiscoveryLog(previousRuns, {
      runMatcher: (r) => {
        const rId = r.response?.variant_id;
        const rKey = r.response?.variant_key;
        return (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
      },
      includeUrls: urlHistoryEnabled,
      includeQueries: queryHistoryEnabled,
      suppressions: {
        urlsChecked: new Set(rdfSuppRows.filter((s) => s.kind === 'url').map((s) => s.item)),
        queriesRun: new Set(rdfSuppRows.filter((s) => s.kind === 'query').map((s) => s.item)),
      },
    });

    const systemPrompt = buildReleaseDateFinderPrompt({
      product,
      variantLabel: variant.label,
      variantType: variant.type,
      siblingsExcluded,
      familyModelCount,
      ambiguityLevel,
      previousDiscovery,
      promptOverride,
    });
    const userMsg = JSON.stringify({
      brand: product.brand, model: product.model, base_model: product.base_model,
      variant: variant.key, variant_label: variant.label, variant_type: variant.type,
    });

    const callStartedAt = new Date().toISOString();
    const callStartMs = Date.now();

    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: null,
      model: _mt.actualModel,
      variant: variant.label,
      label: 'Discovery',
    });

    let llmResult, usage;
    try {
      const r = await callLlm({
        product,
        variantLabel: variant.label,
        variantType: variant.type,
        siblingsExcluded,
        familyModelCount,
        ambiguityLevel,
        previousDiscovery,
        promptOverride,
      });
      llmResult = r.result;
      usage = r.usage;
    } catch (err) {
      logger?.error?.('rdf_llm_failed', { product_id: product.product_id, variant: variant.key, error: err.message });
      return {
        error: err.message,
        candidate: null,
        persisted: false,
      };
    }

    const durationMs = Date.now() - callStartMs;
    const releaseDate = String(llmResult?.release_date || '').trim();
    const evidenceRefs = Array.isArray(llmResult?.evidence_refs) ? llmResult.evidence_refs : [];
    // WHY: Candidate confidence drives the publisher threshold gate. The
    // LLM's overall self-rated confidence (llmResult.confidence) is less
    // honest than the strongest per-source confidence — the LLM can claim
    // 90% overall while citing only tier5@55 sources. Derive from max
    // per-source so the publisher's gate (publishConfidenceThreshold)
    // reflects real evidence strength, consistent with the drawer's
    // row-header derivation (maxSourceConfidence).
    let confidence = 0;
    for (const r of evidenceRefs) {
      const n = Number(r?.confidence);
      if (Number.isFinite(n) && n > confidence) confidence = n;
    }
    const unknownReason = String(llmResult?.unknown_reason || '').trim();
    const isUnknown = releaseDate === '' || releaseDate.toLowerCase() === 'unk';
    const belowConfidence = !isUnknown && confidence < minConfidence;

    const candidateEntry = {
      variant_id: variant.variant_id || null,
      variant_key: variant.key,
      variant_label: variant.label,
      variant_type: variant.type,
      value: isUnknown ? '' : releaseDate,
      confidence,
      unknown_reason: isUnknown ? unknownReason : '',
      below_confidence: belowConfidence,
      sources: evidenceRefs.map((e) => ({
        url: String(e.url || ''),
        tier: String(e.tier || 'unknown'),
        confidence: Number.isFinite(e.confidence) ? e.confidence : 0,
      })),
      ran_at: ranAt,
    };

    const responsePayload = {
      started_at: callStartedAt,
      duration_ms: durationMs,
      variant_id: variant.variant_id || null,
      variant_key: variant.key,
      variant_label: variant.label,
      release_date: releaseDate,
      confidence,
      unknown_reason: unknownReason,
      evidence_refs: evidenceRefs,
      discovery_log: llmResult?.discovery_log || { urls_checked: [], queries_run: [], notes: [] },
      ...(loopId ? { loop_id: loopId } : {}),
    };

    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: responsePayload,
      model: _mt.actualModel,
      variant: variant.label,
      usage,
      label: 'Discovery',
    });

    // Submit to publisher gate — skip for unknown or low-confidence results.
    // WHY: The publisher's field rule (min_evidence_refs, tier_preference) is the
    // authority on what qualifies for publication. RDF only gates on confidence
    // locally to avoid spamming the candidate table with explicit 'unk' rows.
    // WHY: Publisher failures must NOT abort the run — persistence of the RDF
    // run data is independent. Errors go to the logger so they stay auditable.
    let publishResult = null;
    if (!isUnknown && !belowConfidence && fieldRules && evidenceRefs.length > 0) {
      try {
        const submitResult = submitCandidate({
          category: product.category,
          productId: product.product_id,
          fieldKey: 'release_date',
          value: releaseDate,
          confidence,
          sourceMeta: {
            source: 'release_date_finder',
            source_type: 'feature',
            model: _mt.actualModel,
          },
          fieldRules,
          knownValues: null,
          componentDb: null,
          specDb,
          productRoot,
          metadata: {
            variant_key: variant.key,
            variant_label: variant.label,
            variant_type: variant.type,
            // WHY: Universal {url, tier, confidence} shape from the shared evidence
            // module. LLM's evidence_refs flows through unchanged.
            evidence_refs: evidenceRefs,
            llm_access_mode: _mt.actualAccessMode || 'api',
            llm_thinking: _mt.actualThinking,
            llm_web_search: _mt.actualWebSearch,
            llm_effort_level: _mt.actualEffortLevel || '',
          },
          appDb,
          config,
          variantId: variant.variant_id || null,
        });
        publishResult = submitResult;
        if (submitResult?.status === 'rejected') {
          candidateEntry.rejected_by_gate = true;
          candidateEntry.rejection_reasons = submitResult.validationResult?.rejections || [];
        }
      } catch (err) {
        logger?.error?.('rdf_publisher_submit_failed', {
          product_id: product.product_id, variant: variant.key, error: err.message,
        });
        candidateEntry.publisher_error = err.message;
      }
    }

    // Persist run + per-variant candidate projection
    const selected = { candidates: [candidateEntry] };
    const merged = mergeReleaseDateDiscovery({
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

    const store = specDb.getFinderStore('releaseDateFinder');
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

    return {
      candidate: candidateEntry,
      persisted: true,
      publishStatus: publishResult?.status || 'skipped',
      published: publishResult?.publishResult?.status === 'published',
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

/**
 * RDF loop satisfaction predicate:
 *  - stop on definitive unknown (LLM said "unk" with a reason → no retry helps)
 *  - stop once the candidate reached the publisher (any status other than 'skipped'
 *    means we cleared the local gate; publisher-side rejection won't be fixed by
 *    another LLM call with the same evidence)
 */
function rdfLoopSatisfied(result) {
  if (!result) return false;
  if (result.candidate?.unknown_reason && result.candidate?.value === '') return true;
  if (result.publishStatus && result.publishStatus !== 'skipped') return true;
  return false;
}

/**
 * Run the Release Date Finder for a single product — one LLM call per variant.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, model, base_model, variant }
 * @param {object} opts.appDb
 * @param {object} opts.specDb
 * @param {object} [opts.config]
 * @param {object} [opts.logger]
 * @param {string} [opts.productRoot]
 * @param {string|null} [opts.variantKey] — single variant, or null for all
 * @param {Function} [opts.onStageAdvance]
 * @param {Function} [opts.onModelResolved]
 * @param {Function} [opts.onStreamChunk]
 * @param {Function} [opts.onQueueWait]
 * @param {Function} [opts.onLlmCallComplete]
 * @param {Function} [opts.onVariantProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function runReleaseDateFinder(opts) {
  const { onStageAdvance = null, onVariantProgress = null, variantKey = null, logger = null } = opts;
  const setup = await setupReleaseDateFinderRun(opts);
  if (setup.earlyReject) return setup.earlyReject;
  const { ctx, _mt } = setup;

  // WHY: Snapshot previousRuns once for single-run — behavior preserved from
  // pre-refactor. Loop mode re-reads per attempt so retries see prior URLs.
  const previousDoc = readReleaseDates({ productId: ctx.product.product_id, productRoot: ctx.productRoot });
  const staticPreviousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];
  const produceForVariant = buildProduceForVariant(ctx, () => staticPreviousRuns);

  const { rejected, rejections, perVariantResults, variants } = await runPerVariant({
    specDb: ctx.specDb, product: ctx.product, variantKey,
    staggerMs: 1000,
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

/**
 * Loop the Release Date Finder: retry each variant up to perVariantAttemptBudget
 * times, stopping early when the call reaches the publisher gate or LLM returns
 * definitive unknown. All runs emitted within a single call share one loop_id
 * (written into run.response.loop_id) so the UI can group them.
 *
 * Same opts shape as runReleaseDateFinder, plus:
 *   @param {Function} [opts.onLoopProgress] — ({ variantKey, variantLabel, attempt, budget, satisfied, loopId }) => void
 *
 * @returns {Promise<{rejected, rejections?, variants_processed, candidates, errors, fallbackUsed, loopId}>}
 */
export async function runReleaseDateFinderLoop(opts) {
  const {
    onStageAdvance = null, onVariantProgress = null, onLoopProgress = null,
    variantKey = null, logger = null,
  } = opts;
  const setup = await setupReleaseDateFinderRun(opts);
  if (setup.earlyReject) return setup.earlyReject;
  const { ctx, _mt, finderStore } = setup;

  const perVariantAttemptBudget = parseInt(finderStore?.getSetting?.('perVariantAttemptBudget') || '1', 10) || 1;

  // WHY: Re-read previousRuns fresh for each attempt so later attempts see the
  // URLs and queries from earlier attempts in the same loop. Matches PIF's
  // executeOneCall behavior (discovery log accumulates across calls).
  const previousRunsProvider = () => {
    const doc = readReleaseDates({ productId: ctx.product.product_id, productRoot: ctx.productRoot });
    return Array.isArray(doc?.runs) ? doc.runs : [];
  };
  const produceForVariant = buildProduceForVariant(ctx, previousRunsProvider);

  const { rejected, rejections, perVariantResults, variants, loopId } = await runVariantFieldLoop({
    specDb: ctx.specDb,
    product: ctx.product,
    variantKey,
    budget: perVariantAttemptBudget,
    staggerMs: 1000,
    onStageAdvance, onVariantProgress, onLoopProgress,
    logger,
    produceForVariant,
    satisfactionPredicate: rdfLoopSatisfied,
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
