/**
 * runVariantFieldLoop — generic per-variant retry loop for variantFieldProducer
 * modules (RDF today; MSRP / weight / dimensions / etc. on deck).
 *
 * Wraps runPerVariant with a per-variant retry loop. Each variant gets up to
 * `budget` attempts; the loop stops early when satisfactionPredicate(result)
 * is truthy. One loop_id is generated per top-level call and shared across
 * all variants and attempts, so the UI can group the emitted runs.
 *
 * Contract:
 *   - Callers own produceForVariant and the satisfactionPredicate — this file
 *     is domain-blind.
 *   - budget is clamped to at least 1 (defensive: category_authority settings
 *     come in as strings and may arrive as 0 or NaN).
 *   - onLoopProgress is emitted AFTER each attempt (one event per attempt).
 *   - The surfaced per-variant result is the last call's result, enriched
 *     with a `_loop` metadata object: { attempts, satisfied, loopId }.
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
 * @param {number} [opts.budget]                            — max attempts per variant (clamped ≥1)
 * @param {(variant, index, ctx) => Promise<object>} opts.produceForVariant
 * @param {(result) => boolean} opts.satisfactionPredicate  — stop-loop predicate per attempt
 * @param {number} [opts.staggerMs]                         — delay between variants
 * @param {(stage: string) => void} [opts.onStageAdvance]
 * @param {(completed, total, variantKey) => void} [opts.onVariantProgress]
 * @param {(ev: { variantKey, variantLabel, attempt, budget, satisfied, loopId }) => void} [opts.onLoopProgress]
 * @param {object} [opts.logger]
 */
export async function runVariantFieldLoop({
  specDb,
  product,
  variantKey = null,
  budget = 1,
  produceForVariant,
  satisfactionPredicate,
  staggerMs = 1000,
  onStageAdvance = null,
  onVariantProgress = null,
  onLoopProgress = null,
  logger = null,
}) {
  const loopId = generateLoopId();
  const effectiveBudget = Math.max(1, Number.isFinite(budget) ? Math.floor(budget) : 1);

  const wrappedProduce = async (variant, i, ctx) => {
    let lastResult = null;
    for (let attempt = 1; attempt <= effectiveBudget; attempt++) {
      const attemptCtx = { ...ctx, attempt, budget: effectiveBudget, loopId };
      const result = await produceForVariant(variant, i, attemptCtx);
      lastResult = result;
      const satisfied = Boolean(satisfactionPredicate?.(result));
      onLoopProgress?.({
        variantKey: variant.key,
        variantLabel: variant.label,
        attempt,
        budget: effectiveBudget,
        satisfied,
        loopId,
      });
      if (satisfied) {
        return {
          ...(result || {}),
          _loop: { attempts: attempt, satisfied: true, loopId },
        };
      }
    }
    return {
      ...(lastResult || {}),
      _loop: { attempts: effectiveBudget, satisfied: false, loopId },
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
