/**
 * Key Finder — Loop orchestrator (Phase 3b).
 *
 * Budget-bounded retry wrapping `runKeyFinder`. Each iteration re-reads
 * discovery state (via runKeyFinder's existing load path) so mid-loop URLs
 * and queries accumulate, and re-packs passengers (via runKeyFinder's
 * existing buildPassengers call) so resolved peers drop from subsequent
 * iterations' bundles. Pattern adapted from RDF's `variantFieldLoop` to
 * per-key scope.
 *
 * Invariants:
 *   - Tier bundle is SNAPSHOTTED once at loop entry and threaded into every
 *     iteration via `tierBundleOverride`. Mid-loop LLM Config edits do not
 *     split the Loop across two models.
 *   - `loop_id` is generated once and stamped on every iteration's run
 *     record via `runKeyFinder`'s `loop_id` opt.
 *   - Exit conditions: publisher published, definitive unk (value='unk' AND
 *     non-empty unknown_reason), AbortSignal aborted, or attempts exhausted.
 *   - Per-(pid, fieldKey) queue lock lives at the ROUTE layer (not here) —
 *     see keyFinderRoutes.js.
 *
 * Return shape: { iterations, final_status, loop_id, runs, last_result? }
 *   final_status ∈ { 'published' | 'definitive_unk' | 'aborted' | 'budget_exhausted' }
 */

import { resolvePhaseModelByTier } from '../../core/llm/client/routing.js';
import { generateLoopId } from '../../core/finder/loopIdGenerator.js';
import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { FieldRulesEngine } from '../../engine/fieldRulesEngine.js';
import { calcKeyBudget, readFloatKnob } from './keyBudgetCalc.js';
import { runKeyFinder as defaultRunKeyFinder } from './keyFinder.js';

const VALID_TIERS = new Set(['easy', 'medium', 'hard', 'very_hard']);
function normalizeTierName(difficulty) {
  const raw = String(difficulty || '').trim();
  return VALID_TIERS.has(raw) ? raw : 'medium';
}

function readKnob(finderStore, key) {
  return finderStore?.getSetting?.(key) || '';
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

function loadBudgetSettings(finderStore) {
  return {
    budgetRequiredPoints: parseJsonSetting(readKnob(finderStore, 'budgetRequiredPoints'), { mandatory: 2, non_mandatory: 1 }),
    budgetAvailabilityPoints: parseJsonSetting(readKnob(finderStore, 'budgetAvailabilityPoints'), { always: 1, sometimes: 2, rare: 3 }),
    budgetDifficultyPoints: parseJsonSetting(readKnob(finderStore, 'budgetDifficultyPoints'), { easy: 1, medium: 2, hard: 3, very_hard: 4 }),
    budgetVariantPointsPerExtra: readFloatKnob(readKnob(finderStore, 'budgetVariantPointsPerExtra'), 0.25),
    budgetFloor: parseInt(readKnob(finderStore, 'budgetFloor') || '3', 10) || 3,
  };
}

/**
 * @param {object} opts
 * @param {object} opts.product
 * @param {string} opts.fieldKey
 * @param {string} opts.category
 * @param {object} opts.specDb
 * @param {object|null} [opts.appDb]
 * @param {object} [opts.config]
 * @param {object} [opts.policy]
 * @param {Function|null} [opts.broadcastWs]
 * @param {AbortSignal} [opts.signal]
 * @param {object} [opts.logger]
 * @param {string} [opts.productRoot]
 * @param {Function} [opts.onLoopProgress] — Canonical pill-shape emission; see
 *   docs/implementation/active operations upgrade/active-operations-upgrade-guide.html §6.
 *   Shape: { publish: {count, target, satisfied, confidence},
 *            callBudget: {used, budget, exhausted},
 *            final_status, loop_id }
 *   Intermediate iterations emit final_status=null; terminal iteration emits
 *   the computed final_status. Skipped-resolved path emits exactly once.
 * @param {Function} [opts._runKeyFinderOverride] — test seam; default imports runKeyFinder
 * @returns {Promise<{iterations:number, final_status:string, loop_id:string, runs:number[], last_result?:object}>}
 */
export async function runKeyFinderLoop(opts) {
  const {
    product, fieldKey, category,
    specDb, appDb = null, config = {},
    policy: explicitPolicy = null,
    broadcastWs = null, signal, logger = null,
    productRoot,
    onLoopProgress,
    // Telemetry callbacks — threaded per-iteration to runKeyFinder so each
    // iteration's stage transitions + model info reach the operations panel.
    onStageAdvance = null,
    onModelResolved = null,
    onStreamChunk = null,
    onQueueWait = null,
    onPhaseChange = null,
    onLlmCallComplete = null,
    onPassengersRegistered = null,
    _runKeyFinderOverride = null,
  } = opts;

  if (!fieldKey) throw new Error('runKeyFinderLoop: fieldKey is required');
  if (isReservedFieldKey(fieldKey)) {
    throw new Error(`reserved_field_key: ${fieldKey} is owned by another finder and cannot be run through keyFinder`);
  }

  // 1. Field-rule lookup (fail-fast before budget calc or any iteration)
  const engine = await FieldRulesEngine.create(category, { specDb });
  const fieldRule = engine.rules?.[fieldKey];
  if (!fieldRule) {
    throw new Error(`missing_field_rule: no compiled field rule for "${fieldKey}" in category "${category}"`);
  }

  // 2. Budget calc — ONCE per loop
  const finderStore = specDb.getFinderStore?.('keyFinder') ?? null;
  const budgetSettings = loadBudgetSettings(finderStore);
  const activeVariants = specDb?.variants?.listActive?.(product.product_id) || [];
  const variantCount = activeVariants.length > 0 ? activeVariants.length : 1;
  let { attempts } = calcKeyBudget({ fieldRule, variantCount, settings: budgetSettings });

  // 2.1 Publish-gate snapshot for the pill — read once at loop entry so the
  // sidebar can show "0/N evidence @ ≥T conf" before any iteration runs. The
  // publisher uses the same numbers (config.publishConfidenceThreshold default
  // 0.7, fieldRule.evidence.min_evidence_refs) when it gates each candidate.
  // Threshold normalized to 0–100 to match the LLM's confidence scale.
  const evidenceTarget = Number.isFinite(fieldRule?.evidence?.min_evidence_refs)
    ? fieldRule.evidence.min_evidence_refs
    : 1;
  const rawThreshold = Number.isFinite(config?.publishConfidenceThreshold)
    ? config.publishConfidenceThreshold
    : 0.7;
  const thresholdPct = rawThreshold <= 1 ? Math.round(rawThreshold * 100) : Math.round(rawThreshold);

  // Snapshot of "best so far" — the pill shows the most recent (and best
  // available) candidate's actual evidence + confidence numbers so the user
  // can read "got 1/2 evidence at 70 conf, need ≥95" between iterations.
  let lastEvidenceCount = 0;
  let lastConfidencePct = null;

  // 2.5 Re-loop gate (SSOT §6.2): if the primary is already published at loop
  //     entry, cap attempts via reloopRunBudget (default 1). A 0 value becomes
  //     a no-op with distinct final_status='skipped_resolved' so the WS event +
  //     op history reflect "we chose not to re-run" rather than budget
  //     exhaustion from a 0-attempt loop.
  const loop_id = generateLoopId();
  const reloopRunBudget = parseInt(readKnob(finderStore, 'reloopRunBudget') || '1', 10);
  const reloopBudget = Number.isFinite(reloopRunBudget) && reloopRunBudget >= 0 ? reloopRunBudget : 1;
  // WHY: Deterministic publisher — "field is satisfied" means "any row for this
  // (product, field) is resolved." hasPublishedValue is cheaper and more
  // accurate than getResolvedFieldCandidate (which hydrates a single row and
  // misses set_union cases where multiple rows are jointly resolved).
  const alreadyResolved = typeof specDb?.hasPublishedValue === 'function'
    ? specDb.hasPublishedValue(product.product_id, fieldKey)
    : (typeof specDb?.getResolvedFieldCandidate === 'function'
      && Boolean(specDb.getResolvedFieldCandidate(product.product_id, fieldKey)));
  if (alreadyResolved) {
    if (reloopBudget === 0) {
      // WHY: Emit a terminal pill so the operations panel sees the skip path
      // explicitly instead of a silent op that never renders loopProgress.
      try {
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
          loop_id,
        });
      } catch { /* onLoopProgress errors must not abort the loop */ }
      return {
        iterations: 0,
        final_status: 'skipped_resolved',
        loop_id,
        runs: [],
        last_result: null,
      };
    }
    attempts = Math.min(attempts, reloopBudget);
  }

  // 3. Tier bundle SNAPSHOT — once at loop entry. Locked: mid-loop LLM Config
  //    edits do not affect iterations 2..N. See plan §tier-bundle.
  const policy = explicitPolicy
    || { keyFinderTiers: config.keyFinderTiers, models: { plan: config.llmModelPlan || '' } };
  const tierBundle = resolvePhaseModelByTier(policy, fieldRule.difficulty);
  const tierName = normalizeTierName(fieldRule.difficulty);

  const runKeyFinder = _runKeyFinderOverride || defaultRunKeyFinder;
  const runs = [];
  let lastResult = null;
  let final_status = 'budget_exhausted';
  let iterations = 0;

  for (let iter = 1; iter <= attempts; iter += 1) {
    if (signal?.aborted) {
      final_status = 'aborted';
      break;
    }

    // Pre-iteration pill — fires BEFORE runKeyFinder so the sidebar card shows
    // "we're on call iter/attempts" the moment the LLM call starts, not only
    // after it returns. Carries the publisher's gate constants (target +
    // threshold) immediately and the previous-best evidence/confidence so the
    // user always sees "0/N evidence @ ≥T conf" while the next call is in
    // flight.
    try {
      onLoopProgress?.({
        publish: {
          evidenceCount: lastEvidenceCount,
          evidenceTarget,
          satisfied: false,
          confidence: lastConfidencePct,
          threshold: thresholdPct,
        },
        callBudget: { used: iter, budget: attempts, exhausted: iter >= attempts },
        final_status: null,
        loop_id,
      });
    } catch { /* onLoopProgress errors must not abort the loop */ }

    const result = await runKeyFinder({
      product, fieldKey, category,
      specDb, appDb, config,
      policy,
      broadcastWs, signal, logger,
      productRoot,
      // Phase 3b contract additions:
      loop_id,
      tierBundleOverride: { name: tierName, ...tierBundle },
      mode: 'loop',
      onStageAdvance, onModelResolved, onStreamChunk, onQueueWait, onPhaseChange, onLlmCallComplete,
      onPassengersRegistered,
    });

    iterations = iter;
    lastResult = result;
    if (Number.isFinite(result?.run_number)) runs.push(result.run_number);

    // Post-iteration pill — uses the publisher's gate output (result.publish
    // wired up in keyFinder.js) so the user sees the EXACT numbers the
    // publish gate compared. result.publish.actual is the evidence-ref count
    // the publisher counted; result.publish.confidence is the candidate's
    // normalized confidence (0–1 → percent).
    try {
      const iterSatisfied = result?.status === 'published';
      const pubGate = result?.publish ?? null;
      const iterEvidence = Number.isFinite(pubGate?.actual)
        ? pubGate.actual
        : (Array.isArray(result?.candidate?.evidence_refs) ? result.candidate.evidence_refs.length : 0);
      const iterConfidenceRaw = Number.isFinite(pubGate?.confidence)
        ? pubGate.confidence
        : (Number.isFinite(result?.candidate?.confidence) ? result.candidate.confidence : null);
      const iterConfidencePct = iterConfidenceRaw == null
        ? null
        : (iterConfidenceRaw <= 1 ? Math.round(iterConfidenceRaw * 100) : Math.round(iterConfidenceRaw));

      lastEvidenceCount = iterEvidence;
      lastConfidencePct = iterConfidencePct;

      onLoopProgress?.({
        publish: {
          evidenceCount: iterEvidence,
          evidenceTarget,
          satisfied: iterSatisfied,
          confidence: iterConfidencePct,
          threshold: thresholdPct,
        },
        callBudget: {
          used: iter,
          budget: attempts,
          exhausted: iter >= attempts,
        },
        final_status: null,
        loop_id,
      });
    } catch { /* onLoopProgress errors must not abort the loop */ }

    // Exit on publisher published
    if (result?.status === 'published') {
      final_status = 'published';
      break;
    }

    // Exit on definitive unk (explicit unknown_reason means the LLM has declared
    // "this cannot be found" — further retries would waste budget)
    if (result?.status === 'unk' && String(result?.unknown_reason || '').trim().length > 0) {
      final_status = 'definitive_unk';
      break;
    }

    // Exit on Gate 1 inconsistency purge — retrying wastes budget against an
    // unreliable model that already demonstrated conf/evidence conflict.
    if (result?.status === 'rejected_inconsistent') {
      final_status = 'definitive_reject';
      break;
    }

    // Otherwise: below_threshold / accepted / no_evidence / runtime issue — retry
  }

  // Terminal pill — re-emits the final state with the computed final_status so
  // the operations panel shows the exit outcome (published / definitive_unk /
  // budget_exhausted / aborted) instead of the last null-status snapshot.
  try {
    const terminalSatisfied = lastResult?.status === 'published';
    onLoopProgress?.({
      publish: {
        evidenceCount: lastEvidenceCount,
        evidenceTarget,
        satisfied: terminalSatisfied,
        confidence: lastConfidencePct,
        threshold: thresholdPct,
      },
      callBudget: {
        used: iterations,
        budget: attempts,
        exhausted: iterations >= attempts && iterations > 0,
      },
      final_status,
      loop_id,
    });
  } catch { /* onLoopProgress errors must not abort the loop */ }

  return {
    iterations,
    final_status,
    loop_id,
    runs,
    last_result: lastResult,
  };
}
