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
 * @param {(ev: { variantKey, variantLabel, attempt, budget, satisfied, skipped, loopId }) => void} [opts.onLoopProgress]
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
  logger = null,
}) {
  const loopId = generateLoopId();

  const wrappedProduce = async (variant, i, ctx) => {
    const rawBudget = resolveBudget?.(variant);
    const variantBudget = Number.isFinite(rawBudget) ? Math.max(0, Math.floor(rawBudget)) : 0;

    if (variantBudget === 0) {
      onLoopProgress?.({
        variantKey: variant.key,
        variantLabel: variant.label,
        attempt: 0,
        budget: 0,
        satisfied: true,
        skipped: true,
        loopId,
      });
      return { _loop: { attempts: 0, satisfied: true, skipped: true, loopId } };
    }

    let lastResult = null;
    for (let attempt = 1; attempt <= variantBudget; attempt++) {
      const attemptCtx = { ...ctx, attempt, budget: variantBudget, loopId };
      const result = await produceForVariant(variant, i, attemptCtx);
      lastResult = result;
      const satisfied = Boolean(satisfactionPredicate?.(result));
      onLoopProgress?.({
        variantKey: variant.key,
        variantLabel: variant.label,
        attempt,
        budget: variantBudget,
        satisfied,
        skipped: false,
        loopId,
      });
      if (satisfied) {
        return {
          ...(result || {}),
          _loop: { attempts: attempt, satisfied: true, skipped: false, loopId },
        };
      }
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
