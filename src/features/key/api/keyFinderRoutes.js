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
  updateStage,
  updateModelInfo,
  appendLlmCall,
  completeOperation,
  failOperation,
  cancelOperation,
  fireAndForget,
} from '../../../core/operations/index.js';
import { createStreamBatcher } from '../../../core/llm/streamBatcher.js';
import { stripRunSourceFromCandidates } from '../../../core/finder/finderRoutes.js';
import { buildOrchestratorProduct } from '../../../core/finder/finderOrchestrationHelpers.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { isReservedFieldKey, getReservedFieldKeys } from '../../../core/finder/finderExclusions.js';
import { calcKeyBudget } from '../keyBudgetCalc.js';
import { packBundle } from '../keyBundler.js';
import { runKeyFinder } from '../keyFinder.js';
import { compileKeyFinderPreviewPrompt } from '../keyFinderPreviewPrompt.js';
import {
  readKeyFinder,
  deleteKeyFinderRun,
  deleteKeyFinderAll,
} from '../keyStore.js';

const ROUTE_PREFIX = 'key-finder';
const MODULE_TYPE = 'kf';
const SOURCE_TYPE = 'key_finder';

function resolveProductRoot(config) {
  return config?.productRoot || defaultProductRoot();
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
    budgetVariantPointsPerExtra: parseInt(readKnobString(store, 'budgetVariantPointsPerExtra') || '1', 10) || 1,
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
    groupBundlingOnly: boolKnob('groupBundlingOnly', true),
    bundlingPassengerCost: parseJsonSetting(readKnobString(store, 'bundlingPassengerCost'), { easy: 1, medium: 2, hard: 4, very_hard: 8 }),
    bundlingPoolPerPrimary: parseJsonSetting(readKnobString(store, 'bundlingPoolPerPrimary'), { easy: 6, medium: 4, hard: 2, very_hard: 1 }),
    passengerDifficultyPolicy: readKnobString(store, 'passengerDifficultyPolicy') || 'less_or_equal',
    budgetVariantPointsPerExtra: parseInt(readKnobString(store, 'budgetVariantPointsPerExtra') || '1', 10) || 1,
  };
}

function resolveVariantCount(specDb, productId) {
  const variants = specDb?.variants?.listActive?.(productId) || [];
  return variants.length > 0 ? variants.length : 1;
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
  const variantCount = resolveVariantCount(specDb, productId);

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

  // Bulk-compute the resolved set once (O(keys) SQL reads, not O(keys²)) + group
  // rules by group name so packBundle can find same-group candidates cheaply.
  // Reserved field_keys (CEF/PIF/RDF/SKF-owned + EG-locked) are excluded from
  // the candidate pool so keyFinder doesn't bundle peers owned by other finders.
  const resolvedSet = new Set();
  const rulesByGroup = new Map();
  for (const [fk, rule] of Object.entries(fields)) {
    if (isReservedFieldKey(fk)) continue;
    if (hasResolvedHook && specDb.getResolvedFieldCandidate(productId, fk)) {
      resolvedSet.add(fk);
    }
    const g = rule?.group || '';
    if (!rulesByGroup.has(g)) rulesByGroup.set(g, []);
    rulesByGroup.get(g).push({ fieldKey: fk, fieldRule: rule });
  }

  function computeBundlePreview(fk, rule) {
    if (!bundlingSettings.bundlingEnabled || !rule) return [];
    const group = rule.group || '';
    const sameGroup = rulesByGroup.get(group) || [];
    const candidates = sameGroup.filter((c) => c.fieldKey !== fk);
    const { breakdown } = packBundle({
      primary: { fieldKey: fk, fieldRule: rule },
      candidates,
      resolvedFieldKeys: resolvedSet,
      settings: bundlingSettings,
    });
    // Breakdown entries carry the passenger cost directly from the packer.
    // UI renders "{field_key} (cost)" so users can eyeball-sum against the
    // primary's pool without re-deriving costs on the client.
    return breakdown.map((b) => ({ field_key: b.fieldKey, cost: b.cost }));
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
      if (unknownReason) lastStatus = 'unk';
      else if (published) lastStatus = 'resolved';
      else if (confidence !== null && threshold > 0 && confidence < threshold) lastStatus = 'below_threshold';
      else lastStatus = 'unresolved';
    }

    const candidateRows = specDb?.getFieldCandidatesByProductAndField?.(productId, fk) || [];
    const { attempts: budget } = rule
      ? calcKeyBudget({ fieldRule: rule, variantCount, settings: budgetSettings })
      : { attempts: null };

    return {
      field_key: fk,
      group: String(ui.group || rule?.group || '').trim(),
      label: String(ui.label || fk),
      difficulty: String(rule?.difficulty || '').trim(),
      availability: String(rule?.availability || '').trim(),
      required_level: String(rule?.required_level || '').trim(),
      variant_dependent: rule?.variant_dependent === true,
      budget,
      bundle_preview: computeBundlePreview(fk, rule),
      last_run_number: run ? (run.run_number || null) : null,
      last_ran_at: run ? (run.ran_at || run.started_at || '') : null,
      last_status: lastStatus,
      last_value: run ? (perKey.value !== undefined ? perKey.value : null) : null,
      last_confidence: confidence,
      last_model: run ? (run.model || '') : null,
      candidate_count: candidateRows.length,
      published,
      run_count: runCountByKey.get(fk) || 0,
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

  return fieldKeys.map((fk) => buildRow(fk, fields[fk]));
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
    // (enabled / scope / policy / pool / cost). Passenger cost is RAW (no
    // variant scaling). Invalidates via the 'settings' domain template.
    if (method === 'GET' && category && productId && parts[3] === 'bundling-config' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const s = readBundlingSettings(specDb);
      return jsonRes(res, 200, {
        enabled: s.bundlingEnabled,
        groupBundlingOnly: s.groupBundlingOnly,
        passengerDifficultyPolicy: s.passengerDifficultyPolicy,
        poolPerPrimary: s.bundlingPoolPerPrimary,
        passengerCost: s.bundlingPassengerCost,
        variantCount: resolveVariantCount(specDb, productId),
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
        selected: (scope === 'key' && fieldKey) ? selectedForField(doc, fieldKey) : doc.selected,
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

        if (!fieldKey) return jsonRes(res, 400, { error: 'field_key is required in POST body' });
        if (isReservedFieldKey(fieldKey)) {
          return jsonRes(res, 400, {
            error: 'reserved_field_key',
            field_key: fieldKey,
            message: `${fieldKey} is owned by another finder (CEF / PIF / RDF / SKF) and cannot run through keyFinder`,
          });
        }
        if (mode === 'loop') {
          return jsonRes(res, 400, {
            error: 'loop_mode_not_yet_supported',
            message: 'Phase 3b owns Loop mode. Phase 3a ships Run mode only.',
          });
        }
        if (mode !== 'run') {
          return jsonRes(res, 400, { error: 'invalid_mode', message: `mode must be "run" (got "${mode}")` });
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

        const opArgs = {
          type: MODULE_TYPE,
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          // WHY: Per-key scope — frontend's useRunningFieldKeys picks this up via
          // WS broadcast so the row's running pill survives past the optimistic
          // useFireAndForget window.
          fieldKey,
          stages: ['Discovery', 'Validate', 'Publish'],
        };
        op = registerOperation(opArgs);
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: `${ROUTE_PREFIX}-run`,
            category,
            entities: { productIds: [productId] },
            meta: { productId, field_key: fieldKey },
          },
          asyncWork: () => {
            const product = buildOrchestratorProduct({ productId, category, productRow });
            return runKeyFinder({
              product,
              fieldKey,
              category,
              specDb,
              appDb,
              config,
              logger: logger || null,
              signal,
              broadcastWs,
              productRoot: resolveProductRoot(config),
            });
          },
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
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
        entities: { productIds: [productId] },
        meta: { productId, deletedRun: runNumber, field_keys: affectedKeys },
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
        entities: { productIds: [productId] },
        meta: { productId, field_keys: [...affectedKeys] },
      });
      return jsonRes(res, 200, { status: 'deleted_all' });
    }

    return jsonRes(res, 404, { error: 'unknown key-finder route', path: parts.join('/') });
  };
}
