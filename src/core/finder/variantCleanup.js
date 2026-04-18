/**
 * Variant-delete cleanup for variantFieldProducer modules.
 *
 * WHY: CEF owns variants. When a variant is deleted, any downstream
 * variantFieldProducer finder (RDF today; SKU/price/availability etc. tomorrow)
 * must strip its own per-variant state — field_candidates rows are already
 * handled by cascadeVariantIdFromCandidates, but each finder also keeps
 * per-variant entries inside its own JSON file and SQL summary/runs blobs.
 *
 * This module is the one place that knows how to strip those. CEF's
 * deleteVariant iterates FINDER_MODULES where moduleClass ===
 * 'variantFieldProducer' and calls stripVariantFromFieldProducerHistory for
 * each — adding a new variantFieldProducer feature costs only a
 * finderModuleRegistry entry (it already requires one for DDL/routes/etc.).
 *
 * Convention (enforced by variantFieldProducer contract):
 *   - JSON at {productRoot}/{productId}/{filePrefix}.json
 *   - selected.candidates[]  — aggregate, one entry per variant
 *   - runs[].selected.candidates[]  — per-run projections
 *   - runs[].response.candidates[]  — LLM output
 *   - SQL summary column 'candidates' mirrors selected.candidates
 *   - SQL summary column 'candidate_count' mirrors candidates.length
 *   - SQL runs_table rows have selected_json / response_json blobs
 *
 * Each candidate entry carries variant_id (optional) and variant_key.
 *
 * Run-deletion semantics: a variantFieldProducer does one LLM call per variant,
 * so a run's purpose IS that variant. If all of a run's candidates were for
 * the deleted variant, the run itself is removed (JSON entry + SQL row). Runs
 * with mixed variants stay, filtered to surviving variants.
 *
 * Aggregate recomputation: after filtering, the top-level selected.candidates
 * is rebuilt as latest-wins-per-variant across remaining runs — the shared
 * reduction pattern for variantFieldProducer modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';

function readFinderJson(productRoot, productId, filePrefix) {
  try {
    const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeFinderJson(productRoot, productId, filePrefix, data) {
  const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function variantMatches(candidate, variantId, variantKey) {
  if (!candidate) return false;
  if (variantId && candidate.variant_id === variantId) return true;
  if (variantKey && candidate.variant_key === variantKey) return true;
  return false;
}

function filterCandidates(arr, variantId, variantKey) {
  if (!Array.isArray(arr)) return { result: arr, changed: false };
  const result = arr.filter(c => !variantMatches(c, variantId, variantKey));
  return { result, changed: result.length !== arr.length };
}

// WHY: variantFieldProducer runs identify their target variant on the run
// response (e.g. RDF puts variant_id / variant_key on run.response). This is
// orthogonal to candidates — a failed/empty-result LLM call still owns its
// target variant and must be purged on variant delete. We also accept
// run-level variant fields for robustness across module shapes.
function runTargetsVariant(run, variantId, variantKey) {
  if (!run) return false;
  const matches = (vid, vkey) => (
    (variantId && vid === variantId) || (variantKey && vkey === variantKey)
  );
  if (matches(run.variant_id, run.variant_key)) return true;
  if (run.response && matches(run.response.variant_id, run.response.variant_key)) return true;
  if (run.selected && matches(run.selected.variant_id, run.selected.variant_key)) return true;
  return false;
}

// WHY: variantFieldProducer aggregation convention — latest run per variant wins.
// RDF uses this via finderJsonStore's recalculateSelected. Re-derived here so
// the cleanup stays independent of the module's own store instance.
function latestWinsPerVariant(runs) {
  const latestByKey = new Map();
  const sorted = [...runs]
    .filter(r => r?.status !== 'rejected')
    .sort((a, b) => (a.run_number || 0) - (b.run_number || 0));
  for (const run of sorted) {
    for (const c of (run?.selected?.candidates || [])) {
      const key = c?.variant_id || c?.variant_key || '';
      if (!key) continue;
      latestByKey.set(key, c);
    }
  }
  return [...latestByKey.values()];
}

/**
 * Strip a variant's entries from one variantFieldProducer module's history.
 *
 * @param {object} opts
 * @param {object} opts.specDb
 * @param {string} opts.productId
 * @param {string} [opts.variantId]   — preferred match
 * @param {string} [opts.variantKey]  — fallback match
 * @param {object} opts.module        — finderModuleRegistry entry (filePrefix, id, ...)
 * @param {string} [opts.productRoot]
 * @returns {{ changed: boolean, runsTouched: number, runsDeleted: number }}
 */
export function stripVariantFromFieldProducerHistory({
  specDb, productId, variantId, variantKey, module, productRoot,
}) {
  if (!module || module.moduleClass !== 'variantFieldProducer') {
    return { changed: false, runsTouched: 0, runsDeleted: 0 };
  }
  if (!variantId && !variantKey) return { changed: false, runsTouched: 0, runsDeleted: 0 };

  productRoot = productRoot || defaultProductRoot();
  const data = readFinderJson(productRoot, productId, module.filePrefix);
  if (!data) return { changed: false, runsTouched: 0, runsDeleted: 0 };

  const runs = Array.isArray(data.runs) ? data.runs : [];
  const touchedRuns = [];          // runs that survived with candidates filtered
  const deletedRunNumbers = [];    // runs whose only candidates were for the deleted variant
  const remaining = [];

  for (const run of runs) {
    // Check 1: does this run's identity (response.variant_id, etc.) target the
    // deleted variant? If yes, the run is wholly that variant's — delete it.
    if (runTargetsVariant(run, variantId, variantKey)) {
      deletedRunNumbers.push(run.run_number);
      continue;
    }

    // Check 2: candidate-level filtering for runs without explicit identity
    // (e.g. mixed-variant runs).
    const selBefore = Array.isArray(run?.selected?.candidates) ? run.selected.candidates.length : 0;
    const respBefore = Array.isArray(run?.response?.candidates) ? run.response.candidates.length : 0;
    const hadAnyBefore = selBefore > 0 || respBefore > 0;

    let filtered = false;
    if (run?.selected && Array.isArray(run.selected.candidates)) {
      const { result, changed } = filterCandidates(run.selected.candidates, variantId, variantKey);
      if (changed) { run.selected.candidates = result; filtered = true; }
    }
    if (run?.response && Array.isArray(run.response.candidates)) {
      const { result, changed } = filterCandidates(run.response.candidates, variantId, variantKey);
      if (changed) { run.response.candidates = result; filtered = true; }
    }

    const selAfter = Array.isArray(run?.selected?.candidates) ? run.selected.candidates.length : 0;
    const respAfter = Array.isArray(run?.response?.candidates) ? run.response.candidates.length : 0;
    const hasAnyAfter = selAfter > 0 || respAfter > 0;

    if (filtered && hadAnyBefore && !hasAnyAfter) {
      deletedRunNumbers.push(run.run_number);
      continue;
    }

    if (filtered) touchedRuns.push(run);
    remaining.push(run);
  }

  const hadRunChanges = touchedRuns.length > 0 || deletedRunNumbers.length > 0;

  // Also filter the top-level aggregate even if no run was touched (defensive).
  let aggregateChanged = false;
  if (data.selected && Array.isArray(data.selected.candidates)) {
    const { result, changed } = filterCandidates(data.selected.candidates, variantId, variantKey);
    if (changed) { data.selected.candidates = result; aggregateChanged = true; }
  }

  if (!hadRunChanges && !aggregateChanged) {
    return { changed: false, runsTouched: 0, runsDeleted: 0 };
  }

  // Recompute aggregate as latest-wins-per-variant across remaining runs.
  // WHY: Filtering alone could leave a stale aggregate entry from a now-deleted
  // run. Reducing from the surviving runs keeps the aggregate honest.
  if (hadRunChanges) {
    data.selected = data.selected || {};
    data.selected.candidates = latestWinsPerVariant(remaining);
  }

  data.runs = remaining;
  data.run_count = remaining.length;
  data.last_ran_at = remaining.length
    ? (remaining[remaining.length - 1].ran_at || data.last_ran_at || '')
    : '';

  // next_run_number never reuses deleted numbers.
  const maxRemaining = remaining.length ? Math.max(...remaining.map(r => r.run_number || 0)) : 0;
  data.next_run_number = Math.max(data.next_run_number || 0, maxRemaining + 1, 1);

  data.updated_at = new Date().toISOString();
  writeFinderJson(productRoot, productId, module.filePrefix, data);

  const finderStore = specDb.getFinderStore?.(module.id);
  if (finderStore) {
    const aggregate = data.selected?.candidates || [];
    finderStore.updateSummaryField(productId, 'candidates', JSON.stringify(aggregate));
    finderStore.updateSummaryField(productId, 'candidate_count', aggregate.length);

    // Bookkeeping on the SQL summary row.
    if (typeof finderStore.updateBookkeeping === 'function') {
      finderStore.updateBookkeeping(productId, {
        latest_ran_at: data.last_ran_at || '',
        run_count: data.run_count || 0,
      });
    }

    // Remove SQL rows for fully-deleted runs.
    if (typeof finderStore.removeRun === 'function') {
      for (const runNumber of deletedRunNumbers) {
        finderStore.removeRun(productId, runNumber);
      }
    }

    // Rewrite SQL blobs for survived-but-filtered runs.
    if (typeof finderStore.updateRunJson === 'function') {
      for (const run of touchedRuns) {
        finderStore.updateRunJson(productId, run.run_number, {
          selected: run.selected || {},
          response: run.response || {},
        });
      }
    }
  }

  return { changed: true, runsTouched: touchedRuns.length, runsDeleted: deletedRunNumbers.length };
}
