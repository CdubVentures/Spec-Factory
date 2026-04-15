/**
 * Generic Finder JSON Store — per-product durable SSOT.
 *
 * Factory that creates read/write/merge/delete operations for any finder
 * module. Each finder stores runs + derived `selected` state in a JSON
 * file per product: `.workspace/products/{pid}/{filePrefix}.json`.
 *
 * Invariants:
 * - Latest-wins: `selected` reflects the latest non-rejected run
 * - Rejected runs are counted but don't overwrite selected
 * - `next_run_number` is a monotonic high-water mark (never reused)
 * - Each run stores full prompt + response for auditability
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';

// WHY: On Windows, fs.unlinkSync can fail with EBUSY/EPERM when the file is
// transiently locked by antivirus, search indexer, or editor file watchers.
// A short synchronous retry avoids silent data resurrection via reseed cycles.
const RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 80;

function unlinkWithRetry(filePath) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch (err) {
      if (err.code === 'ENOENT') return; // already gone — success
      if (RETRY_CODES.has(err.code) && attempt < MAX_RETRIES) {
        // WHY: synchronous spin-wait — acceptable on a rare deletion codepath
        const deadline = Date.now() + RETRY_DELAY_MS;
        while (Date.now() < deadline) { /* spin */ }
        continue;
      }
      throw err; // non-retryable or exhausted retries — caller must handle
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.filePrefix — e.g. 'color_edition' → reads/writes 'color_edition.json'
 * @param {Function} opts.emptySelected — () => default empty selected object for this finder
 * @param {Function} [opts.recalculateSelected] — (validRuns) => selected object. Override for
 *   modules that accumulate across runs instead of latest-wins (e.g. PIF).
 */
export function createFinderJsonStore({ filePrefix, emptySelected, recalculateSelected, extraFields }) {
  const fileName = `${filePrefix}.json`;

  function resolvePath(productId, productRoot) {
    const root = productRoot || defaultProductRoot();
    return path.join(root, productId, fileName);
  }

  function emptyTemplate(productId, category) {
    return {
      product_id: productId || '',
      category: category || '',
      selected: emptySelected(),
      last_ran_at: '',
      run_count: 0,
      next_run_number: 1,
      runs: [],
    };
  }

  function read({ productId, productRoot }) {
    const filePath = resolvePath(productId, productRoot);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function write({ productId, productRoot, data }) {
    const filePath = resolvePath(productId, productRoot);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // WHY: Extra fields live alongside runs on the doc but are NOT derived from runs.
  // recalculateFromRuns must carry them forward from the existing doc.
  // Default: PIF's evaluations + carousel_slots. CEF passes ['variant_registry'].
  const EXTRA_FIELDS = extraFields || ['evaluations', 'carousel_slots'];

  function pickExtraFields(doc) {
    if (!doc) return {};
    const extras = {};
    for (const key of EXTRA_FIELDS) {
      if (doc[key] !== undefined) extras[key] = doc[key];
    }
    return extras;
  }

  // WHY: Eval fields (eval_best, eval_flags, hero, hero_rank, etc.) are written
  // onto selected.images by the carousel builder, not by runs. When we
  // recalculate selected from runs, those fields are lost. Re-overlay them
  // from the existing doc by filename match so they survive recalculation.
  const EVAL_IMAGE_FIELDS = ['eval_best', 'eval_flags', 'eval_reasoning', 'eval_source', 'hero', 'hero_rank'];

  function overlayEvalFields(newSelected, existingSelected) {
    if (!existingSelected?.images?.length || !newSelected?.images?.length) return;
    const evalMap = new Map();
    for (const img of existingSelected.images) {
      const hasEval = EVAL_IMAGE_FIELDS.some(f => img[f] !== undefined);
      if (hasEval) evalMap.set(img.filename, img);
    }
    if (evalMap.size === 0) return;
    for (const img of newSelected.images) {
      const existing = evalMap.get(img.filename);
      if (existing) {
        for (const f of EVAL_IMAGE_FIELDS) {
          if (existing[f] !== undefined) img[f] = existing[f];
        }
      }
    }
  }

  /**
   * Recalculate all derived state from a runs array.
   * Pure function — selected = latest non-rejected run's selected values.
   * Optional existingDoc preserves non-run fields (evaluations, carousel_slots).
   */
  function recalculateFromRuns(runs, productId, category, existingDoc) {
    if (!runs || runs.length === 0) {
      return { ...emptyTemplate(productId, category), runs: [], ...pickExtraFields(existingDoc) };
    }

    const sorted = [...runs].sort((a, b) => a.run_number - b.run_number);
    const overallLatest = sorted[sorted.length - 1];
    const maxRunNumber = overallLatest.run_number;

    const validRuns = sorted.filter(r => r.status !== 'rejected');
    const latestValid = validRuns.length > 0 ? validRuns[validRuns.length - 1] : null;

    const selected = recalculateSelected
      ? recalculateSelected(validRuns)
      : (latestValid?.selected || emptySelected());

    // Re-overlay eval fields from existing doc so carousel builder results survive
    if (existingDoc?.selected) overlayEvalFields(selected, existingDoc.selected);

    return {
      product_id: productId || '',
      category: category || '',
      selected,
      last_ran_at: overallLatest.ran_at || '',
      run_count: runs.length,
      next_run_number: maxRunNumber + 1,
      runs: sorted,
      ...pickExtraFields(existingDoc),
    };
  }

  /**
   * Merge new discovery results into existing file. Appends run + sets selected.
   * Latest-wins: top-level `selected` is always the latest non-rejected run's output.
   */
  function merge({ productId, productRoot, newDiscovery, run }) {
    const existing = read({ productId, productRoot })
      || emptyTemplate(productId, newDiscovery.category);

    const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
    // WHY: next_run_number is the monotonic high-water mark.
    // Fallback chain for backward compat with old JSON files lacking next_run_number.
    const runNumber = existing.next_run_number
      || (existing.run_count || existingRuns.length || 0) + 1;

    const runEntry = {
      run_number: runNumber,
      ran_at: newDiscovery.last_ran_at || new Date().toISOString(),
      model: run.model || 'unknown',
      fallback_used: Boolean(run.fallback_used),
      ...(run.status ? { status: run.status } : {}),
      ...(run.mode ? { mode: run.mode } : {}),
      ...(run.loop_id ? { loop_id: run.loop_id } : {}),
      ...(run.started_at ? { started_at: run.started_at } : {}),
      ...(run.duration_ms != null ? { duration_ms: run.duration_ms } : {}),
      selected: run.selected || emptySelected(),
      prompt: run.prompt || { system: '', user: '' },
      response: run.response || emptySelected(),
    };

    // WHY: recalculateSelected hook lets modules accumulate across runs
    // instead of latest-wins (e.g. PIF unions images per variant).
    const newSelected = run.status === 'rejected'
      ? (existing.selected || emptySelected())
      : (recalculateSelected
          ? recalculateSelected([...existingRuns, runEntry].filter(r => r.status !== 'rejected'))
          : runEntry.selected);

    // WHY: recalculateSelected rebuilds from per-run images which lack eval fields.
    // Re-overlay eval fields from the existing doc so carousel builder results survive.
    if (run.status !== 'rejected' && existing.selected) {
      overlayEvalFields(newSelected, existing.selected);
    }

    const merged = {
      product_id: existing.product_id || productId || '',
      category: existing.category || newDiscovery.category || '',
      selected: newSelected,
      last_ran_at: newDiscovery.last_ran_at || existing.last_ran_at || '',
      run_count: existingRuns.length + 1,
      next_run_number: runNumber + 1,
      runs: [...existingRuns, runEntry],
      ...pickExtraFields(existing),
    };

    write({ productId, productRoot, data: merged });
    return merged;
  }

  /**
   * Delete a single run by run_number. Recalculates selected from remaining runs.
   * WHY: Extra fields (variant_registry, evaluations, carousel_slots) survive even
   * when all runs are removed — they are not owned by run history.
   */
  function deleteRun({ productId, productRoot, runNumber }) {
    const existing = read({ productId, productRoot });
    if (!existing) return null;

    const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
    const remaining = existingRuns.filter(r => r.run_number !== runNumber);

    if (remaining.length === existingRuns.length) return existing;

    const recalculated = recalculateFromRuns(remaining, existing.product_id || productId, existing.category, existing);
    write({ productId, productRoot, data: recalculated });
    return recalculated;
  }

  /**
   * Delete multiple runs by run_number. Recalculates selected once from remaining.
   * WHY: Extra fields survive even when all runs are removed.
   */
  function deleteRuns({ productId, productRoot, runNumbers }) {
    const existing = read({ productId, productRoot });
    if (!existing) return null;

    const toRemove = new Set(runNumbers);
    const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
    const remaining = existingRuns.filter(r => !toRemove.has(r.run_number));

    if (remaining.length === existingRuns.length) return existing;

    const recalculated = recalculateFromRuns(remaining, existing.product_id || productId, existing.category, existing);
    write({ productId, productRoot, data: recalculated });
    return recalculated;
  }

  /**
   * Delete all runs for a product. Clears run history but preserves extra fields
   * (variant_registry, evaluations, carousel_slots).
   * WHY: "Delete all runs" erases discovery history, not the entity layer.
   * Variants and PIF data are independent of run history.
   */
  function deleteAll({ productId, productRoot }) {
    const existing = read({ productId, productRoot });
    if (!existing) return { deleted: true };

    const cleaned = recalculateFromRuns([], existing.product_id || productId, existing.category, existing);
    write({ productId, productRoot, data: cleaned });
    return { deleted: true };
  }

  return { read, write, recalculateFromRuns, merge, deleteRun, deleteRuns, deleteAll };
}
