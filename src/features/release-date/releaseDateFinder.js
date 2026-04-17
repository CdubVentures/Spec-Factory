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
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import {
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from '../../core/finder/finderOrchestrationHelpers.js';
import { runPerVariant } from '../../core/finder/runPerVariant.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { submitCandidate } from '../publisher/index.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { configInt } from '../../shared/settingsAccessor.js';
import {
  readReleaseDates,
  mergeReleaseDateDiscovery,
} from './releaseDateStore.js';
import {
  createReleaseDateFinderCallLlm,
  accumulateVariantDiscoveryLog,
  buildReleaseDateFinderPrompt,
} from './releaseDateLlmAdapter.js';

function isoCutoffForDays(days) {
  if (!days || days <= 0) return '';
  return new Date(Date.now() - days * 86400000).toISOString();
}

function readFieldRules(productRoot, category, config) {
  // WHY: The publisher needs compiled field rules to validate candidates.
  // Read from category_authority/generated/{category}/field_rules.json
  // (same path structure used by other finders).
  const helperRoot = config?.categoryAuthorityRoot || 'category_authority';
  const rulesPath = path.join(helperRoot, category, 'generated', 'field_rules.json');
  try {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.fields || null;
  } catch {
    return null;
  }
}

/**
 * Run the Release Date Finder for a single product.
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
export async function runReleaseDateFinder({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  productRoot,
  variantKey = null,
  _callLlmOverride = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  onVariantProgress = null,
  signal,
}) {
  productRoot = productRoot || defaultProductRoot();

  const _mt = resolveModelTracking({ config, phaseKey: 'releaseDateFinder', onModelResolved });
  const wrappedOnModelResolved = _mt.wrappedOnModelResolved;

  const finderStore = specDb.getFinderStore('releaseDateFinder');
  const promptOverride = finderStore?.getSetting?.('discoveryPromptTemplate') || '';
  const minConfidence = parseInt(finderStore?.getSetting?.('minConfidence') || '70', 10) || 70;

  // Global discovery cooldowns (pipeline settings — same knobs pipeline uses)
  const urlCutoffIso = isoCutoffForDays(configInt(config, 'urlCooldownDays') ?? 90);
  const queryCutoffIso = isoCutoffForDays(configInt(config, 'queryCooldownDays') ?? 0);

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
  });

  // Sibling exclusion from CEF runs (identity context)
  const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
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
    return { rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }], candidates: [] };
  }
  if (variantKey && !dbVariantsPre.some((v) => v.variant_key === variantKey)) {
    return { rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }], candidates: [] };
  }

  const previousDoc = readReleaseDates({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(previousDoc?.runs) ? previousDoc.runs : [];

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

  const fieldRules = readFieldRules(productRoot, product.category, config);
  const ranAt = new Date().toISOString();

  async function produceForVariant(variant) {
    const previousDiscovery = accumulateVariantDiscoveryLog(previousRuns, variant.key, variant.variant_id, { urlCutoffIso, queryCutoffIso });

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
    const confidence = Number.isFinite(llmResult?.confidence) ? llmResult.confidence : 0;
    const evidence = Array.isArray(llmResult?.evidence) ? llmResult.evidence : [];
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
      sources: evidence.map((e) => ({
        source_url: e.source_url || '',
        source_page: e.source_page || '',
        source_type: e.source_type || 'other',
        tier: e.tier || 'unknown',
        excerpt: e.excerpt || '',
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
      evidence,
      discovery_log: llmResult?.discovery_log || { urls_checked: [], queries_run: [], notes: [] },
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
    if (!isUnknown && !belowConfidence && fieldRules && evidence.length > 0) {
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
            evidence_sources: evidence,
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
  }

  const { rejected, rejections, perVariantResults, variants } = await runPerVariant({
    specDb, product, variantKey,
    staggerMs: 1000,
    onStageAdvance, onVariantProgress, logger,
    produceForVariant,
  });

  if (rejected) {
    return { rejected: true, rejections, candidates: [] };
  }

  const candidates = [];
  const errors = [];
  for (const { variant, result, error } of perVariantResults) {
    if (error) {
      errors.push({ variant_key: variant.key, error });
      continue;
    }
    if (result?.candidate) candidates.push(result.candidate);
  }

  onStageAdvance?.('Complete');

  return {
    rejected: false,
    variants_processed: variants.length,
    candidates,
    errors,
    fallbackUsed: _mt.actualFallbackUsed,
  };
}
