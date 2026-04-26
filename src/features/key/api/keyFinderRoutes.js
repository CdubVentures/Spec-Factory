/**
 * Key Finder — custom route handler.
 *
 * Custom (not createFinderRouteHandler) because keyFinder resolves field_key
 * from the POST body instead of a static registry array, and is product-scoped
 * (no variant iteration). Reuses the shared operations lifecycle + WS broadcast
 * helpers so cancellation, stage tracking, and live events stay SSOT.
 *
 * Endpoints:
 *   POST   /key-finder/:category/:productId        body: { field_key, mode? }
 *   GET    /key-finder/:category                   list summaries
 *   GET    /key-finder/:category/:productId        ?field_key=X → scoped detail
 *   DELETE /key-finder/:category/:productId/runs/:runNumber?field_key=X
 *   DELETE /key-finder/:category/:productId        delete-all runs
 */

import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import {
  registerOperation,
  getOperationSignal,
  countRunningOperations,
  markPassengersRegistered,
  completeOperation,
  failOperation,
  cancelOperation,
  fireAndForget,
  setStatus,
  acquireKeyLock,
} from '../../../core/operations/index.js';
import { buildOperationTelemetry } from '../../../core/operations/buildOperationTelemetry.js';
import { createStreamBatcher } from '../../../core/llm/streamBatcher.js';
import { stripRunSourceFromCandidates } from '../../../core/finder/finderRoutes.js';
import { buildOrchestratorProduct } from '../../../core/finder/finderOrchestrationHelpers.js';
import { FINDER_MODULE_MAP } from '../../../core/finder/finderModuleRegistry.js';
import { scrubFinderDiscoveryHistory } from '../../../core/finder/discoveryHistoryScrub.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { isUnknownSentinel } from '../../../shared/valueNormalizers.js';
import { isReservedFieldKey, getReservedFieldKeys } from '../../../core/finder/finderExclusions.js';
import { calcKeyBudget, readFloatKnob } from '../keyBudgetCalc.js';
import * as keyFinderRegistry from '../../../core/operations/keyFinderRegistry.js';
import { buildPassengers } from '../keyPassengerBuilder.js';
import { isConcreteEvidence } from '../keyConcreteEvidence.js';
import { calcPassengerCost } from '../keyBundler.js';
import { parseAxisOrder } from '../keyBundlerSortAxes.js';
import { resolveKeyFinderFamilySize } from '../keyFamilySize.js';
import { runKeyFinder } from '../keyFinder.js';
import { runKeyFinderLoop } from '../keyFinderLoop.js';
import { compileKeyFinderPreviewPrompt } from '../keyFinderPreviewPrompt.js';
import {
  readKeyFinder,
  deleteKeyFinderRun,
  deleteKeyFinderAll,
  unselectKeyFinderField,
  scrubFieldFromKeyFinder,
} from '../keyStore.js';
import { wipePublisherStateForUnpub } from '../../publisher/publish/wipePublisherStateForUnpub.js';

const ROUTE_PREFIX = 'key-finder';
const MODULE_TYPE = 'kf';
const SOURCE_TYPE = 'key_finder';

function resolveProductRoot(config) {
  return config?.productRoot || defaultProductRoot();
}

const LEGACY_VARIANT_USAGE_ACTIVE_MODES = new Set(['default', 'append', 'override']);

function ruleUsesVariantInventory(fieldRule = {}) {
  const raw = fieldRule?.ai_assist?.variant_inventory_usage;
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (typeof cfg.enabled === 'boolean') return cfg.enabled;
  const legacyMode = String(cfg.mode || '').trim();
  if (legacyMode === 'off') return false;
  if (LEGACY_VARIANT_USAGE_ACTIVE_MODES.has(legacyMode)) return true;
  return true;
}

function ruleUsesPifPriorityImages(fieldRule = {}) {
  const raw = fieldRule?.ai_assist?.pif_priority_images;
  if (typeof raw === 'boolean') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.enabled === 'boolean') {
    return raw.enabled;
  }
  return false;
}

// WHY: extracted so the route → runKeyFinder wiring is unit-testable. The load-
// bearing bit is `policy: config?._llmPolicy`. Without that, runKeyFinder's
// policy fallback (`config.keyFinderTiers`) is always undefined → tier cascade
// collapses to `llmModelPlan` (default "gemini-2.5-flash"), and every tier
// the user configured in the Key Finder LLM panel gets silently ignored.
export function buildKeyFinderCommonOpts({
  product,
  fieldKey,
  category,
  specDb,
  appDb = null,
  config,
  logger = null,
  signal = null,
  broadcastWs = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onPhaseChange = null,
  onLlmCallComplete = null,
  onPassengersRegistered = null,
  forceSolo = false,
  // WHY: threaded through so the pill shape emitted by runKeyFinderLoop reaches
  // updateLoopProgress on the ops registry. Without this the Loop sidebar card
  // never renders publish/callBudget and the user sees no budget/target info.
  onLoopProgress = null,
}) {
  return {
    product,
    fieldKey,
    category,
    specDb,
    appDb,
    config,
    policy: config?._llmPolicy ?? null,
    logger: logger || null,
    signal,
    broadcastWs,
    productRoot: resolveProductRoot(config),
    onStageAdvance,
    onModelResolved,
    onStreamChunk,
    onQueueWait,
    onPhaseChange,
    onLlmCallComplete,
    onPassengersRegistered,
    forceSolo,
    onLoopProgress,
  };
}

function filterRunsByFieldKey(runs, fieldKey) {
  if (!Array.isArray(runs)) return [];
  if (!fieldKey) return runs;
  // WHY: A key may appear in a run as either primary or passenger (bundling).
  // Scoping history to primary-only would hide passenger-resolved runs from
  // the key's own history drawer and prompt slide-over.
  return runs.filter((r) => {
    if (r?.response?.primary_field_key === fieldKey) return true;
    const results = r?.response?.results;
    return results && Object.prototype.hasOwnProperty.call(results, fieldKey);
  });
}

function filterRunsByGroupKeys(runs, groupKeys) {
  if (!Array.isArray(runs) || !groupKeys) return [];
  return runs.filter((r) => groupKeys.has(r?.response?.primary_field_key));
}

function groupKeysFromCompiledRules(rules, groupName) {
  const keys = new Set();
  const fields = rules?.fields || {};
  for (const [fk, rule] of Object.entries(fields)) {
    if (rule?.group === groupName) keys.add(fk);
  }
  return keys;
}

function readKnobString(finderStore, key) {
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

// Mirror the orchestrator's settings read (keyFinder.js step 2) so the /summary
// budget column matches what Loop mode would actually spend.
function readBudgetSettings(specDb) {
  const store = specDb?.getFinderStore?.('keyFinder') ?? null;
  return {
    budgetRequiredPoints: parseJsonSetting(readKnobString(store, 'budgetRequiredPoints'), { mandatory: 2, non_mandatory: 1 }),
    budgetAvailabilityPoints: parseJsonSetting(readKnobString(store, 'budgetAvailabilityPoints'), { always: 1, sometimes: 2, rare: 3 }),
    budgetDifficultyPoints: parseJsonSetting(readKnobString(store, 'budgetDifficultyPoints'), { easy: 1, medium: 2, hard: 3, very_hard: 4 }),
    budgetVariantPointsPerExtra: readFloatKnob(readKnobString(store, 'budgetVariantPointsPerExtra'), 0.25),
    budgetFloor: parseInt(readKnobString(store, 'budgetFloor') || '3', 10) || 3,
  };
}

// Bundling settings — mirrors keyFinder.js step 2 so /summary's bundle_preview
// matches what Run / Loop would pack if the row were fired right now.
function readBundlingSettings(specDb) {
  const store = specDb?.getFinderStore?.('keyFinder') ?? null;
  const boolKnob = (k, d) => {
    const raw = readKnobString(store, k);
    if (raw === '') return d;
    return raw === 'true';
  };
  return {
    bundlingEnabled: boolKnob('bundlingEnabled', false),
    alwaysSoloRun: boolKnob('alwaysSoloRun', true),
    groupBundlingOnly: boolKnob('groupBundlingOnly', true),
    bundlingPassengerCost: parseJsonSetting(readKnobString(store, 'bundlingPassengerCost'), { easy: 1, medium: 2, hard: 4, very_hard: 8 }),
    bundlingPassengerVariantCostPerExtra: readFloatKnob(readKnobString(store, 'bundlingPassengerVariantCostPerExtra'), 0.25),
    bundlingPoolPerPrimary: parseJsonSetting(readKnobString(store, 'bundlingPoolPerPrimary'), { easy: 6, medium: 4, hard: 2, very_hard: 1 }),
    passengerDifficultyPolicy: readKnobString(store, 'passengerDifficultyPolicy') || 'less_or_equal',
    passengerExcludeAtConfidence: parseInt(readKnobString(store, 'passengerExcludeAtConfidence') || '95', 10),
    passengerExcludeMinEvidence: parseInt(readKnobString(store, 'passengerExcludeMinEvidence') || '3', 10),
    bundlingSortAxisOrder: readKnobString(store, 'bundlingSortAxisOrder') || '',
    budgetVariantPointsPerExtra: readFloatKnob(readKnobString(store, 'budgetVariantPointsPerExtra'), 0.25),
    bundlingOverlapCapEasy: parseInt(readKnobString(store, 'bundlingOverlapCapEasy') || '2', 10),
    bundlingOverlapCapMedium: parseInt(readKnobString(store, 'bundlingOverlapCapMedium') || '4', 10),
    bundlingOverlapCapHard: parseInt(readKnobString(store, 'bundlingOverlapCapHard') || '6', 10),
    bundlingOverlapCapVeryHard: parseInt(readKnobString(store, 'bundlingOverlapCapVeryHard') || '0', 10),
  };
}

function resolveFamilySize(specDb, productId) {
  return resolveKeyFinderFamilySize({ specDb, productId });
}

function normalizeUnknownValueForOutput(value, unknownReason = '') {
  if (isUnknownSentinel(value)) return null;
  if (String(unknownReason || '').trim()) return null;
  return value;
}

function normalizeUnknownPerKeyForOutput(perKey) {
  if (!perKey || typeof perKey !== 'object') return perKey;
  return {
    ...perKey,
    value: normalizeUnknownValueForOutput(perKey.value, perKey.unknown_reason),
  };
}

function normalizeUnknownKeyMapForOutput(keyMap) {
  if (!keyMap || typeof keyMap !== 'object') return keyMap;
  return Object.fromEntries(
    Object.entries(keyMap).map(([fk, perKey]) => [fk, normalizeUnknownPerKeyForOutput(perKey)]),
  );
}

function normalizeUnknownRunForOutput(run) {
  if (!run || typeof run !== 'object') return run;
  return {
    ...run,
    selected: run.selected && typeof run.selected === 'object'
      ? { ...run.selected, keys: normalizeUnknownKeyMapForOutput(run.selected.keys) }
      : run.selected,
    response: run.response && typeof run.response === 'object'
      ? { ...run.response, results: normalizeUnknownKeyMapForOutput(run.response.results) }
      : run.response,
  };
}

function normalizeUnknownSelectedForOutput(selected) {
  return normalizeUnknownPerKeyForOutput(selected);
}

// WHY: Rollup from JSON + compiled rules — one row per eligible key (not just
// keys that have runs). Axes come from compiled rules so the panel can render
// difficulty/availability/required tags without a second round-trip. Budget is
// computed per row (matches what Phase 3b Loop would spend). Run fields are
// null for keys that haven't run yet. Iterating JSON matches the Dual-State
// mandate and avoids SQL json_extract portability concerns.
function buildSummaryFromDocAndRules({ doc, specDb, productId, publishConfidenceThreshold }) {
  const compiled = specDb?.getCompiledRules?.() || null;
  const fields = compiled?.fields || {};
  const runs = Array.isArray(doc?.runs) ? doc.runs : [];
  const budgetSettings = readBudgetSettings(specDb);
  const bundlingSettings = readBundlingSettings(specDb);
  const familySize = resolveFamilySize(specDb, productId);

  const newestByKey = new Map();
  const runCountByKey = new Map();
  for (const run of runs) {
    const fk = run?.response?.primary_field_key;
    if (!fk) continue;
    runCountByKey.set(fk, (runCountByKey.get(fk) || 0) + 1);
    const existing = newestByKey.get(fk);
    if (!existing || (run.run_number || 0) > (existing.run_number || 0)) {
      newestByKey.set(fk, run);
    }
  }

  const threshold = Number.isFinite(publishConfidenceThreshold) ? publishConfidenceThreshold : 0;
  const hasResolvedHook = typeof specDb?.getResolvedFieldCandidate === 'function';

  // Returns { preview, pool, totalCost }. `pool` is the primary's bundling
  // budget (bundlingPoolPerPrimary[difficulty]) — surfaced even when bundling
  // is OFF so the UI can show the theoretical capacity per difficulty tier.
  // `preview` is the packed passenger list with per-passenger cost; users can
  // eyeball-sum it against the pool via the Bundled cell's "{used}/{pool}" prefix.
  //
  // Routes through buildPassengers (the live-run path) so the column reflects
  // cross-group scope, in-flight registry hard-block, per-tier overlap caps,
  // and passengerExclude* gates — not just same-group + resolved-peers.
  function computeBundlePreview(fk, rule) {
    const ruleDifficulty = rule?.difficulty || '';
    const pool = Number(bundlingSettings.bundlingPoolPerPrimary?.[ruleDifficulty]) || 0;
    if (!bundlingSettings.bundlingEnabled || !rule) {
      return { preview: [], pool, totalCost: 0 };
    }
    const passengers = buildPassengers({
      primary: { fieldKey: fk, fieldRule: rule },
      engineRules: fields,
      specDb,
      productId,
      settings: bundlingSettings,
      familySize,
    });
    const preview = passengers.map((p) => ({
      field_key: p.fieldKey,
      cost: calcPassengerCost({
        difficulty: p.fieldRule.difficulty,
        settings: bundlingSettings,
        familySize,
      }),
    }));
    const totalCost = preview.reduce((sum, e) => sum + e.cost, 0);
    return { preview, pool, totalCost };
  }

  function buildRow(fk, rule) {
    const ui = rule?.ui || {};
    const run = newestByKey.get(fk) || null;
    const perKey = run?.response?.results?.[fk] || {};
    const unknownReason = String(perKey.unknown_reason || '').trim();
    const confidence = typeof perKey.confidence === 'number' ? perKey.confidence : null;
    const hasEvidence = Array.isArray(perKey.evidence_refs) && perKey.evidence_refs.length > 0;

    let published = false;
    if (hasResolvedHook) {
      published = Boolean(specDb.getResolvedFieldCandidate(productId, fk));
    } else if (run) {
      published = !unknownReason && confidence !== null && confidence >= threshold && hasEvidence;
    }

    let lastStatus = null;
    if (run) {
      if (published) lastStatus = 'resolved';
      else if (unknownReason) lastStatus = 'unresolved';
      else if (confidence !== null && threshold > 0 && confidence < threshold) lastStatus = 'below_threshold';
      else lastStatus = 'unresolved';
    } else if (published) {
      // Key is published via the candidate cascade (was a passenger on another
      // key's primary run — no own primary run record exists). Without this,
      // the UI shows status='—' and the user thinks the key is unresolved
      // even though getResolvedFieldCandidate returns truthy and the passenger
      // pool correctly excludes it.
      lastStatus = 'resolved';
    }

    const candidateRows = specDb?.getFieldCandidatesByProductAndField?.(productId, fk) || [];
    const budgetResult = rule
      ? calcKeyBudget({ fieldRule: rule, familySize, settings: budgetSettings })
      : { attempts: null, rawBudget: null };
    const { attempts: budget, rawBudget: raw_budget } = budgetResult;
    const { preview, pool, totalCost } = computeBundlePreview(fk, rule);
    const inFlight = keyFinderRegistry.count(productId, fk);

    // Concrete-evidence gate: shares the exact same check buildPassengers
    // uses for exclusion, so the UI checkmark and runtime packing stay
    // in lockstep. Display-only top_confidence / top_evidence_count feed
    // the tooltip; they are NOT used for gating.
    const concrete_evidence = rule
      ? isConcreteEvidence({
        specDb, productId, fieldKey: fk, fieldRule: rule,
        excludeConf: bundlingSettings.passengerExcludeAtConfidence,
        excludeEvd: bundlingSettings.passengerExcludeMinEvidence,
      })
      : false;
    const topCandidate = typeof specDb?.getTopFieldCandidate === 'function'
      ? specDb.getTopFieldCandidate(productId, fk)
      : null;
    const top_confidence = topCandidate && Number.isFinite(Number(topCandidate.confidence))
      ? Number(topCandidate.confidence) : null;
    const top_evidence_count = topCandidate && Number.isFinite(Number(topCandidate.evidence_count))
      ? Number(topCandidate.evidence_count) : null;

    // When the key is resolved via passenger cascade (no own primary run),
    // derive display values from the top candidate so the Value + Conf columns
    // don't show em-dash on a resolved key. Lists come out as JSON strings from
    // SQL — try to parse them so the renderer shows the array, not a literal.
    let derivedLastValue = null;
    if (!run && published && topCandidate?.value !== undefined && topCandidate.value !== null) {
      const raw = topCandidate.value;
      if (typeof raw === 'string' && raw.length > 0 && (raw[0] === '[' || raw[0] === '{' || raw === 'true' || raw === 'false' || raw === 'null' || !Number.isNaN(Number(raw)))) {
        try { derivedLastValue = JSON.parse(raw); } catch { derivedLastValue = raw; }
      } else {
        derivedLastValue = raw;
      }
    }

    return {
      field_key: fk,
      group: String(ui.group || rule?.group || '').trim(),
      label: String(ui.label || fk),
      difficulty: String(rule?.difficulty || '').trim(),
      availability: String(rule?.availability || '').trim(),
      required_level: String(rule?.required_level || '').trim(),
      variant_dependent: rule?.variant_dependent === true,
      product_image_dependent: rule?.product_image_dependent === true,
      uses_variant_inventory: rule ? ruleUsesVariantInventory(rule) : false,
      uses_pif_priority_images: rule ? ruleUsesPifPriorityImages(rule) : false,
      budget,
      raw_budget,
      bundle_pool: pool,
      bundle_total_cost: totalCost,
      bundle_preview: preview,
      last_run_number: run ? (run.run_number || null) : null,
      last_ran_at: run ? (run.ran_at || run.started_at || '') : null,
      last_status: lastStatus,
      last_value: run
        ? normalizeUnknownValueForOutput(
          perKey.value !== undefined ? perKey.value : null,
          unknownReason,
        )
        : derivedLastValue,
      last_confidence: run
        ? confidence
        : (published && top_confidence !== null ? top_confidence : null),
      last_model: run ? (run.model || '') : (published && topCandidate?.model ? String(topCandidate.model) : null),
      // WHY: Last Model column needs the same badge set (LAB/API + thinking +
      // webSearch + effort + FB) that Run History already renders via
      // FinderRunModelBadge. Without these the column is a bare string with
      // no way to surface "this run fell back" or "this ran on the lab".
      last_fallback_used: run ? Boolean(run.fallback_used) : null,
      last_access_mode: run ? (run.access_mode || '') : null,
      last_effort_level: run ? (run.effort_level || '') : null,
      last_thinking: run ? Boolean(run.thinking) : null,
      last_web_search: run ? Boolean(run.web_search) : null,
      candidate_count: candidateRows.length,
      published,
      concrete_evidence,
      top_confidence,
      top_evidence_count,
      run_count: runCountByKey.get(fk) || 0,
      in_flight_as_primary: inFlight.asPrimary > 0,
      in_flight_as_passenger_count: inFlight.asPassenger,
    };
  }

  const fieldKeys = Object.keys(fields);
  if (fieldKeys.length === 0) {
    // Fallback: compiled rules unavailable. Return only keys that have run
    // (axes absent). Panel will still function but tags won't render.
    const rows = [];
    for (const fk of newestByKey.keys()) rows.push(buildRow(fk, null));
    return rows;
  }

  // WHY: compiled.fields preserves compile-order, NOT the live field_key_order
  // table that Field Studio's Key Navigator persists. Every consumer of this
  // summary (Overview tier popover renders rows in summary order; KeyFinder
  // panel re-orders via /review/layout but bundle/group cells still flow from
  // here) must see rows in the canonical user-set order. Reorder once at the
  // source so all downstream UIs stay in lockstep with the navigator. New
  // keys not yet in the saved order trail in compile-order.
  const orderedKeys = applyFieldKeyOrder(fieldKeys, specDb);
  return orderedKeys.map((fk) => buildRow(fk, fields[fk]));
}

function applyFieldKeyOrder(fieldKeys, specDb) {
  const orderRow = specDb?.getFieldKeyOrder?.(specDb?.category) ?? null;
  let savedOrder = null;
  if (orderRow?.order_json) {
    try {
      const parsed = JSON.parse(orderRow.order_json);
      if (Array.isArray(parsed)) {
        savedOrder = parsed.filter((k) => typeof k === 'string' && !k.startsWith('__grp::'));
      }
    } catch {
      savedOrder = null;
    }
  }
  if (!savedOrder || savedOrder.length === 0) return fieldKeys;

  const inFields = new Set(fieldKeys);
  const seen = new Set();
  const ordered = [];
  for (const fk of savedOrder) {
    if (inFields.has(fk) && !seen.has(fk)) {
      ordered.push(fk);
      seen.add(fk);
    }
  }
  for (const fk of fieldKeys) {
    if (!seen.has(fk)) ordered.push(fk);
  }
  return ordered;
}

function summaryFromDoc(doc) {
  if (!doc) return null;
  return {
    product_id: doc.product_id,
    category: doc.category,
    run_count: doc.run_count || (doc.runs?.length || 0),
    last_ran_at: doc.last_ran_at || '',
  };
}

function selectedForField(doc, fieldKey) {
  return doc?.selected?.keys?.[fieldKey] || null;
}

export function registerKeyFinderRoutes(ctx) {
  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger } = ctx;

  return async function handleKeyFinderRoutes(parts, params, method, req, res) {
    if (parts[0] !== ROUTE_PREFIX) return false;

    const category = parts[1] || '';
    const productId = parts[2] || '';

    // ── GET /key-finder/:category/reserved-keys — denylist export ─
    // Panel filter source: CEF/PIF/RDF/SKF-owned + EG-locked keys. Derived
    // from FINDER_MODULES ∪ EG_LOCKED_KEYS; client long-caches.
    if (method === 'GET' && category && parts[2] === 'reserved-keys' && !parts[3]) {
      const reserved = [...getReservedFieldKeys()].sort();
      return jsonRes(res, 200, { reserved });
    }

    // ── GET /key-finder/:category — list summaries ────────────────
    if (method === 'GET' && category && !productId) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const productRoot = resolveProductRoot(config);
      // WHY: Phase 3a Part 2 ships a filesystem-scan list. Phase 4 dashboard
      // will switch to a SQL listByCategory once the summary table grows past
      // a handful of products; the shape stays the same.
      const summaries = [];
      try {
        const fs = await import('node:fs');
        const entries = fs.readdirSync(productRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const doc = readKeyFinder({ productId: entry.name, productRoot });
          if (!doc || doc.category !== category) continue;
          summaries.push(summaryFromDoc(doc));
        }
      } catch { /* productRoot missing → empty */ }
      return jsonRes(res, 200, summaries);
    }

    // ── GET /key-finder/:category/:productId/bundling-config — live settings
    // snapshot. Panel uses this to render the BundlingStatusStrip at the top
    // (enabled / scope / policy / pool / cost + family-size surcharge).
    // Invalidates via the 'settings' domain template.
    if (method === 'GET' && category && productId && parts[3] === 'bundling-config' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const s = readBundlingSettings(specDb);
      return jsonRes(res, 200, {
        enabled: s.bundlingEnabled,
        alwaysSoloRun: s.alwaysSoloRun,
        groupBundlingOnly: s.groupBundlingOnly,
        passengerDifficultyPolicy: s.passengerDifficultyPolicy,
        poolPerPrimary: s.bundlingPoolPerPrimary,
        passengerCost: s.bundlingPassengerCost,
        passengerVariantCostPerExtra: s.bundlingPassengerVariantCostPerExtra,
        familySize: resolveFamilySize(specDb, productId),
        overlapCaps: {
          easy: s.bundlingOverlapCapEasy,
          medium: s.bundlingOverlapCapMedium,
          hard: s.bundlingOverlapCapHard,
          very_hard: s.bundlingOverlapCapVeryHard,
        },
        // Canonicalized CSV — frontend renders it directly without re-parsing.
        sortAxisOrder: parseAxisOrder(s.bundlingSortAxisOrder).join(','),
      });
    }

    // ── GET /key-finder/:category/:productId/summary — per-key rollup ─
    // Panel uses this to populate one row per key (status, last_value, etc.).
    // Reads the JSON doc directly (Dual-State mandate: JSON is SSOT).
    if (method === 'GET' && category && productId && parts[3] === 'summary' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const productRoot = resolveProductRoot(config);
      const doc = readKeyFinder({ productId, productRoot });
      const rows = buildSummaryFromDocAndRules({
        doc,
        specDb,
        productId,
        publishConfidenceThreshold: config?.publishConfidenceThreshold,
      });
      return jsonRes(res, 200, rows);
    }

    // ── GET /key-finder/:category/:productId — scoped detail ──────
    if (method === 'GET' && category && productId && !parts[3]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const scope = String(params?.get?.('scope') || 'key').trim();
      const fieldKey = params?.get?.('field_key') || '';
      const groupName = params?.get?.('group') || '';
      const doc = readKeyFinder({ productId, productRoot: resolveProductRoot(config) });
      if (!doc) return jsonRes(res, 404, { error: 'not found' });

      let runs;
      if (scope === 'group') {
        const compiled = specDb.getCompiledRules?.();
        if (!compiled) {
          return jsonRes(res, 404, {
            error: 'rules_not_compiled',
            message: `Compiled rules for "${category}" not available — cannot scope by group`,
          });
        }
        const groupKeys = groupKeysFromCompiledRules(compiled, groupName);
        runs = filterRunsByGroupKeys(doc.runs, groupKeys);
      } else if (scope === 'product') {
        runs = Array.isArray(doc.runs) ? doc.runs : [];
      } else {
        runs = filterRunsByFieldKey(doc.runs, fieldKey);
      }
      runs = runs.map((run) => normalizeUnknownRunForOutput(run));

      const candidates = [];
      if (scope !== 'group' && scope !== 'product' && fieldKey && specDb.getFieldCandidatesByProductAndField) {
        const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey) || [];
        for (const row of rows) candidates.push(row);
      }
      return jsonRes(res, 200, {
        product_id: doc.product_id,
        category: doc.category,
        scope,
        field_key: scope === 'key' ? (fieldKey || null) : null,
        group: scope === 'group' ? (groupName || null) : null,
        selected: (scope === 'key' && fieldKey)
          ? normalizeUnknownSelectedForOutput(selectedForField(doc, fieldKey))
          : (doc.selected && typeof doc.selected === 'object'
            ? { ...doc.selected, keys: normalizeUnknownKeyMapForOutput(doc.selected.keys) }
            : doc.selected),
        runs,
        candidates,
      });
    }

    // ── POST /key-finder/:category/:productId/preview-prompt — compile only
    // WHY: read-only prompt preview. Mirrors the generic finder preview branch
    // at finderRoutes.js:299-337 but hand-wired because keyFinder uses a custom
    // router. No operation registration, no runKeyFinder, no persistence — pure
    // compile. Shares buildPassengers + settings reader with the live runner so
    // preview and run are byte-identical by construction.
    if (method === 'POST' && category && productId && parts[3] === 'preview-prompt' && !parts[4]) {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const body = await readJsonBody(req).catch(() => ({}));
        const product = buildOrchestratorProduct({ productId, category, productRow });
        const envelope = await compileKeyFinderPreviewPrompt({
          product, specDb, appDb, config,
          productRoot: resolveProductRoot(config),
          productId, category,
          logger: logger || null,
          body: body || {},
        });
        return jsonRes(res, 200, envelope);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const statusCode = (err && typeof err === 'object' && Number.isInteger(err.statusCode)) ? err.statusCode : 500;
        if (statusCode >= 500) console.error('[key-finder] POST /preview-prompt failed:', message);
        return jsonRes(res, statusCode, { error: 'preview failed', message });
      }
    }

    // ── POST /key-finder/:category/:productId/discovery-history/scrub ──
    // Discovery-log maintenance only: clears URL/query arrays without deleting
    // key runs, selected values, candidates, evidence, or passenger results.
    if (method === 'POST' && category && productId && parts[3] === 'discovery-history' && parts[4] === 'scrub' && !parts[5]) {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRoot = resolveProductRoot(config);
        const doc = readKeyFinder({ productId, productRoot });
        if (!doc) return jsonRes(res, 404, { error: 'not found' });

        const body = await readJsonBody(req).catch(() => ({}));
        const result = scrubFinderDiscoveryHistory({
          productId,
          productRoot,
          module: FINDER_MODULE_MAP.keyFinder,
          specDb,
          request: body || {},
        });

        emitDataChange({
          broadcastWs,
          event: `${ROUTE_PREFIX}-discovery-history-scrubbed`,
          category,
          entities: { productIds: [productId] },
          meta: { productId, ...result },
        });

        return jsonRes(res, 200, { ...result, category });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonRes(res, 400, { error: 'discovery history scrub failed', message });
      }
    }

    // ── POST /key-finder/:cat/:pid/keys/:fk/unpublish ─────────────
    // Demote resolved→candidate + clear doc.selected.keys[fk] in JSON + wipe
    // every publisher-stamped signal on the demoted row (confidence → 0,
    // evidence rows deleted) so the panel stops rendering it as "high-
    // confidence resolved". The candidate row itself survives — its LLM-
    // submitted value stays for re-evaluation by a future Run. Runs +
    // discovery history are untouched.
    if (method === 'POST' && category && productId && parts[3] === 'keys' && parts[4] && parts[5] === 'unpublish') {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const fieldKey = parts[4];
      if (keyFinderRegistry.count(productId, fieldKey).total > 0) {
        return jsonRes(res, 409, {
          error: 'key_busy',
          field_key: fieldKey,
          message: 'Run or Loop is in flight for this key — wait for it to finish or stop it first.',
        });
      }
      if (typeof specDb.demoteResolvedCandidates === 'function') {
        specDb.demoteResolvedCandidates(productId, fieldKey);
      }
      // Wipe publisher state (confidence + evidence) for the just-demoted
      // row. Must run AFTER the demote; see wipePublisherStateForUnpub.js.
      wipePublisherStateForUnpub({ specDb, productId, fieldKey });
      unselectKeyFinderField({ productId, productRoot: resolveProductRoot(config), fieldKey });
      emitDataChange({
        broadcastWs,
        event: `${ROUTE_PREFIX}-unpublished`,
        category,
        entities: { productIds: [productId], fieldKeys: [fieldKey] },
        meta: { productId, field_key: fieldKey, fieldKey },
      });
      return jsonRes(res, 200, { status: 'unpublished', field_key: fieldKey });
    }

    // ── DELETE /key-finder/:cat/:pid/keys/:fk ─────────────────────
    // Full wipe for one key: demote + strip keyFinder-sourced candidates
    // (evidence cascades via FK) + scrub fk from every run's selected.keys
    // and response.results. Run records stay as audit trail.
    if (method === 'DELETE' && category && productId && parts[3] === 'keys' && parts[4] && !parts[5]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const fieldKey = parts[4];
      if (keyFinderRegistry.count(productId, fieldKey).total > 0) {
        return jsonRes(res, 409, {
          error: 'key_busy',
          field_key: fieldKey,
          message: 'Run or Loop is in flight for this key — wait for it to finish or stop it first.',
        });
      }
      if (typeof specDb.demoteResolvedCandidates === 'function') {
        specDb.demoteResolvedCandidates(productId, fieldKey);
      }
      if (typeof specDb.deleteFieldCandidatesBySourceType === 'function') {
        specDb.deleteFieldCandidatesBySourceType(productId, fieldKey, SOURCE_TYPE);
      }
      const { deletedRuns } = scrubFieldFromKeyFinder({ productId, productRoot: resolveProductRoot(config), fieldKey });
      // Cascade the SQL row deletes for each primary run that got wiped,
      // otherwise the key_finder_runs table keeps stale rows that the summary
      // rebuild contract assumes reflect JSON state.
      if (deletedRuns.length > 0 && typeof specDb.deleteFinderRun === 'function') {
        for (const runNumber of deletedRuns) {
          specDb.deleteFinderRun('keyFinder', productId, runNumber);
        }
      }
      emitDataChange({
        broadcastWs,
        event: `${ROUTE_PREFIX}-field-deleted`,
        category,
        entities: { productIds: [productId], fieldKeys: [fieldKey] },
        meta: { productId, field_key: fieldKey, fieldKey, deleted_runs: deletedRuns },
      });
      return jsonRes(res, 200, { status: 'deleted', field_key: fieldKey, deleted_runs: deletedRuns });
    }

    // ── POST /key-finder/:category/:productId — trigger run ───────
    if (method === 'POST' && category && productId && !parts[3]) {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

        const body = await readJsonBody(req).catch(() => ({}));
        const fieldKey = String(body?.field_key || '').trim();
        const mode = String(body?.mode || 'run').trim();
        const forceSolo = body?.force_solo === true || body?.forceSolo === true;
        const isPifDependencyRun = String(body?.reason || '') === 'pif_dependency';

        if (!fieldKey) return jsonRes(res, 400, { error: 'field_key is required in POST body' });
        if (isReservedFieldKey(fieldKey)) {
          return jsonRes(res, 400, {
            error: 'reserved_field_key',
            field_key: fieldKey,
            message: `${fieldKey} is owned by another finder (CEF / PIF / RDF / SKF) and cannot run through keyFinder`,
          });
        }
        if (mode !== 'run' && mode !== 'loop') {
          return jsonRes(res, 400, { error: 'invalid_mode', message: `mode must be "run" or "loop" (got "${mode}")` });
        }

        // Field rule gate — reject unknown field keys before registering an op
        const compiled = specDb.getCompiledRules?.();
        if (!compiled?.fields?.[fieldKey]) {
          return jsonRes(res, 404, {
            error: 'missing_field_rule',
            field_key: fieldKey,
            message: `Field rule "${fieldKey}" not found in compiled rules for "${category}"`,
          });
        }

        // WHY: Register with status='queued' immediately so the GUI can render
        // a queue badge. For mode='loop' the button visibly locks; for 'run' it
        // stays clickable (serializes silently). Transition to 'running' after
        // acquiring the per-(pid, fieldKey) lock so two concurrent requests on
        // the same key don't race on key_finder.json / SQL writes.
        const opArgs = {
          type: MODULE_TYPE,
          subType: mode === 'loop' ? 'loop' : '',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          // WHY: Per-key scope — frontend's useRunningFieldKeys picks this up via
          // WS broadcast so the row's running pill survives past the optimistic
          // useFireAndForget window.
          fieldKey,
          stages: ['Discovery', 'Validate', 'Publish'],
          status: 'queued',
        };
        op = registerOperation(opArgs);
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        // Acquire the per-(pid, fieldKey) lock BEFORE dispatching asyncWork.
        // Both 'run' and 'loop' share the same lock so Run doesn't race with
        // an in-flight Loop on the same key.
        const release = await acquireKeyLock(MODULE_TYPE, productId, fieldKey);
        setStatus({ id: op.id, status: 'running' });

        const eventName = mode === 'loop' ? `${ROUTE_PREFIX}-loop` : `${ROUTE_PREFIX}-run`;

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: eventName,
            category,
            domains: isPifDependencyRun ? ['key-finder', 'product-image-finder', 'review', 'product', 'publisher'] : null,
            entities: { productIds: [productId], fieldKeys: [fieldKey] },
            meta: { productId, field_key: fieldKey, fieldKey },
          },
          asyncWork: () => {
            const product = buildOrchestratorProduct({ productId, category, productRow });
            const commonOpts = buildKeyFinderCommonOpts({
              product, fieldKey, category, specDb, appDb, config,
              forceSolo,
              logger, signal, broadcastWs,
              // Canonical telemetry bundle — maps the six standard callbacks
              // to the operations registry. Matches RDF / SKU / CEF shape.
              ...buildOperationTelemetry({ op, batcher, mode }),
              // WHY: keyFinder overrides onPassengersRegistered to ALSO emit a
              // data-change event for mid-run /summary invalidation. Under solo
              // Run the passenger list is empty but the PRIMARY is still in the
              // registry, and the hard-block (§priority runs: "additional keys
              // should NOT USE keys on priority runs") must be visible to peer
              // previews immediately. Without this emit, users can't see that
              // a running primary is reserved until the call completes.
              onPassengersRegistered: (passengerFieldKeys) => {
                markPassengersRegistered({ id: op.id, passengerFieldKeys });
                emitDataChange({
                  broadcastWs,
                  event: `${ROUTE_PREFIX}-run`,
                  category,
                  domains: isPifDependencyRun ? ['key-finder', 'product-image-finder', 'review', 'product', 'publisher'] : null,
                  entities: { productIds: [productId], fieldKeys: [fieldKey, ...passengerFieldKeys] },
                  meta: { productId, field_key: fieldKey, fieldKey, passenger_field_keys: passengerFieldKeys, fieldKeys: [fieldKey, ...passengerFieldKeys], phase: 'registered' },
                });
              },
            });
            return mode === 'loop' ? runKeyFinderLoop(commonOpts) : runKeyFinder(commonOpts);
          },
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
          onSettled: release,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${ROUTE_PREFIX}] POST failed:`, message);
        return jsonRes(res, 500, { error: 'key_finder_run_failed', message });
      }
    }

    // ── DELETE /key-finder/:category/:productId/runs/:runNumber ──
    if (method === 'DELETE' && category && productId && parts[3] === 'runs' && parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const runNumber = parseInt(parts[4], 10);
      if (!Number.isFinite(runNumber)) return jsonRes(res, 400, { error: 'invalid_run_number' });
      const productRoot = resolveProductRoot(config);

      const doc = readKeyFinder({ productId, productRoot });
      if (!doc) return jsonRes(res, 404, { error: 'not found' });

      // Cascade: derive affected keys from run.selected.keys (primary + passengers)
      // so bundled candidates don't orphan when their primary run is deleted.
      const targetRun = (doc.runs || []).find((r) => r.run_number === runNumber);
      const affectedKeys = targetRun?.selected?.keys ? Object.keys(targetRun.selected.keys) : [];
      if (affectedKeys.length > 0) {
        stripRunSourceFromCandidates(specDb, productId, affectedKeys, SOURCE_TYPE, [runNumber], config, false);
      }

      deleteKeyFinderRun({ productId, productRoot, runNumber });
      if (specDb.deleteFinderRun) specDb.deleteFinderRun('keyFinder', productId, runNumber);

      emitDataChange({
        broadcastWs,
        event: `${ROUTE_PREFIX}-run-deleted`,
        category,
        entities: { productIds: [productId], fieldKeys: affectedKeys },
        meta: { productId, deletedRun: runNumber, field_keys: affectedKeys, fieldKeys: affectedKeys },
      });
      return jsonRes(res, 200, { status: 'deleted', run_number: runNumber });
    }

    // ── DELETE /key-finder/:category/:productId — delete-all ──────
    if (method === 'DELETE' && category && productId && !parts[3]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const productRoot = resolveProductRoot(config);

      // Collect every field_key this product's keyFinder runs have touched
      // (primary + every passenger across every run) so the candidate cascade
      // is complete, not just the query-string fieldKey.
      const doc = readKeyFinder({ productId, productRoot });
      const affectedKeys = new Set();
      for (const r of doc?.runs || []) {
        for (const k of Object.keys(r?.selected?.keys || {})) affectedKeys.add(k);
      }
      if (affectedKeys.size > 0) {
        stripRunSourceFromCandidates(specDb, productId, [...affectedKeys], SOURCE_TYPE, null, config, false);
      }

      deleteKeyFinderAll({ productId, productRoot });
      if (specDb.deleteFinderAll) specDb.deleteFinderAll('keyFinder', productId);

      emitDataChange({
        broadcastWs,
        event: `${ROUTE_PREFIX}-deleted`,
        category,
        entities: { productIds: [productId], fieldKeys: [...affectedKeys] },
        meta: { productId, field_keys: [...affectedKeys], fieldKeys: [...affectedKeys] },
      });
      return jsonRes(res, 200, { status: 'deleted_all' });
    }

    return jsonRes(res, 404, { error: 'unknown key-finder route', path: parts.join('/') });
  };
}
