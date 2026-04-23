/**
 * runVariantFieldLoop — generic per-variant retry loop for variantFieldProducer
 * modules (RDF today; MSRP / weight / dimensions / etc. on deck).
 *
 * Wraps runPerVariant with a per-variant retry loop. Each variant gets a budget
 * resolved at variant-scope via `resolveBudget(variant)`; the loop stops early
 * when satisfactionPredicate(result) is truthy. One loop_id is generated per
 * top-level call and shared across all variants and attempts, so the UI can
 * group the emitted runs.
 *
 * Contract:
 *   - Callers own produceForVariant, satisfactionPredicate, AND resolveBudget —
 *     this file is domain-blind.
 *   - resolveBudget(variant) returns the max attempts for that variant.
 *     0 = skip variant entirely (no produceForVariant call; one onLoopProgress
 *     event with skipped=true). Caller is responsible for sanitizing inputs.
 *   - onLoopProgress is emitted AFTER each attempt (or once with skipped=true
 *     when budget is 0).
 *   - The surfaced per-variant result is the last call's result, enriched
 *     with a `_loop` metadata object: { attempts, satisfied, skipped, loopId }.
 *   - no_cef_data / unknown_variant rejections propagate unchanged from
 *     runPerVariant (no variants → no loop).
 */
import { runPerVariant } from './runPerVariant.js';
import { generateLoopId } from './loopIdGenerator.js';

function pctFrom(value) {
  if (!Number.isFinite(value)) return null;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

/**
 * @param {object} opts
 * @param {object} opts.specDb                              — SpecDb with variants store
 * @param {object} opts.product                             — { product_id, category, ... }
 * @param {string|null} [opts.variantKey]                   — filter to a single variant
 * @param {(variant) => number} opts.resolveBudget          — per-variant attempt cap; 0 = skip
 * @param {(variant, index, ctx) => Promise<object>} opts.produceForVariant
 * @param {(result) => boolean} opts.satisfactionPredicate  — stop-loop predicate per attempt
 * @param {number} [opts.staggerMs]                         — delay between variants
 * @param {(stage: string) => void} [opts.onStageAdvance]
 * @param {(completed, total, variantKey) => void} [opts.onVariantProgress]
 * @param {Function} [opts.onLoopProgress] — Canonical pill-shape emission. See
 *   active-operations-upgrade-guide.html §6. Shape:
 *     { publish: {evidenceCount, evidenceTarget, satisfied, confidence, threshold},
 *       callBudget: {used, budget, exhausted},
 *       final_status, loop_id, variantKey, variantLabel }
 *   Per-attempt events carry final_status=null + the publisher's gate metrics
 *   from `produceForVariant`'s result.publish. A terminal per-variant event
 *   fires with the derived final_status. Skipped path emits exactly one pill.
 * @param {number} [opts.evidenceTarget=1]   — fieldRule.evidence.min_evidence_refs
 * @param {number} [opts.thresholdPct]       — publishConfidenceThreshold * 100
 * @param {object} [opts.logger]
 */
export async function runVariantFieldLoop({
  specDb,
  product,
  variantKey = null,
  resolveBudget,
  produceForVariant,
  satisfactionPredicate,
  staggerMs = 1000,
  onStageAdvance = null,
  onVariantProgress = null,
  onLoopProgress = null,
  evidenceTarget = 1,
  thresholdPct = null,
  logger = null,
}) {
  const loopId = generateLoopId();

  const wrappedProduce = async (variant, i, ctx) => {
    const rawBudget = resolveBudget?.(variant);
    const variantBudget = Number.isFinite(rawBudget) ? Math.max(0, Math.floor(rawBudget)) : 0;

    if (variantBudget === 0) {
      // Skipped-resolved path — one pill, no attempts fire.
      onLoopProgress?.({
        publish: {
          evidenceCount: evidenceTarget,
          evidenceTarget,
          satisfied: true,
          confidence: null,
          threshold: thresholdPct,
        },
        callBudget: { used: 0, budget: 0, exhausted: false },
        final_status: 'skipped_resolved',
        loop_id: loopId,
        variantKey: variant.key,
        variantLabel: variant.label,
      });
      return { _loop: { attempts: 0, satisfied: true, skipped: true, loopId } };
    }

    let lastResult = null;
    let satisfiedFinal = false;
    let stoppedAtAttempt = 0;
    let lastEvidenceCount = 0;
    let lastConfidencePct = null;

    for (let attempt = 1; attempt <= variantBudget; attempt++) {
      // Pre-attempt pill — sidebar updates to "call N/budget" for THIS variant
      // the moment the LLM call starts, not after it returns. Carries previous
      // best evidence + confidence so the UI doesn't blank out between calls.
      onLoopProgress?.({
        publish: {
          evidenceCount: lastEvidenceCount,
          evidenceTarget,
          satisfied: false,
          confidence: lastConfidencePct,
          threshold: thresholdPct,
        },
        callBudget: { used: attempt, budget: variantBudget, exhausted: attempt >= variantBudget },
        final_status: null,
        loop_id: loopId,
        variantKey: variant.key,
        variantLabel: variant.label,
      });

      const attemptCtx = { ...ctx, attempt, budget: variantBudget, loopId };
      const result = await produceForVariant(variant, i, attemptCtx);
      lastResult = result;
      const satisfied = Boolean(satisfactionPredicate?.(result));

      // Post-attempt pill — uses the publisher's gate metrics threaded through
      // result.publish (mirrors keyFinder.js). Falls back to the candidate's
      // own evidence_refs.length / confidence when the publisher didn't gate.
      const pubGate = result?.publish ?? null;
      const iterEvidence = Number.isFinite(pubGate?.actual)
        ? pubGate.actual
        : (Array.isArray(result?.candidate?.sources) ? result.candidate.sources.length : 0);
      const iterConfidencePct = pctFrom(pubGate?.confidence)
        ?? pctFrom(result?.candidate?.confidence);
      lastEvidenceCount = iterEvidence;
      lastConfidencePct = iterConfidencePct;

      onLoopProgress?.({
        publish: {
          evidenceCount: iterEvidence,
          evidenceTarget,
          satisfied,
          confidence: iterConfidencePct,
          threshold: thresholdPct,
        },
        callBudget: { used: attempt, budget: variantBudget, exhausted: attempt >= variantBudget },
        final_status: null,
        loop_id: loopId,
        variantKey: variant.key,
        variantLabel: variant.label,
      });

      if (satisfied) {
        satisfiedFinal = true;
        stoppedAtAttempt = attempt;
        break;
      }
      stoppedAtAttempt = attempt;
    }

    // Terminal per-variant pill — derived final_status + last known metrics.
    const terminalStatus = satisfiedFinal ? 'published' : 'budget_exhausted';
    onLoopProgress?.({
      publish: {
        evidenceCount: lastEvidenceCount,
        evidenceTarget,
        satisfied: satisfiedFinal,
        confidence: lastConfidencePct,
        threshold: thresholdPct,
      },
      callBudget: {
        used: stoppedAtAttempt,
        budget: variantBudget,
        exhausted: stoppedAtAttempt >= variantBudget && !satisfiedFinal,
      },
      final_status: terminalStatus,
      loop_id: loopId,
      variantKey: variant.key,
      variantLabel: variant.label,
    });

    if (satisfiedFinal) {
      return {
        ...(lastResult || {}),
        _loop: { attempts: stoppedAtAttempt, satisfied: true, skipped: false, loopId },
      };
    }
    return {
      ...(lastResult || {}),
      _loop: { attempts: variantBudget, satisfied: false, skipped: false, loopId },
    };
  };

  const result = await runPerVariant({
    specDb,
    product,
    variantKey,
    staggerMs,
    onStageAdvance,
    onVariantProgress,
    logger,
    produceForVariant: wrappedProduce,
  });

  return { ...result, loopId };
}
