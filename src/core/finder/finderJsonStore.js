/**
 * Generic Finder JSON Store — per-product durable SSOT.
 *
 * Factory that creates read/write/merge/delete operations for any finder
 * module. Each finder stores runs + derived `selected` state in a JSON
 * file per product: `.workspace/products/{pid}/{filePrefix}.json`.
 *
 * Invariants:
 * - Latest-wins: `selected` reflects the latest non-rejected run
 * - Rejected runs are counted but don't overwrite selected/cooldown
 * - `next_run_number` is a monotonic high-water mark (never reused)
 * - Each run stores full prompt + response for auditability
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';

/**
 * @param {object} opts
 * @param {string} opts.filePrefix — e.g. 'color_edition' → reads/writes 'color_edition.json'
 * @param {Function} opts.emptySelected — () => default empty selected object for this finder
 */
export function createFinderJsonStore({ filePrefix, emptySelected }) {
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
      cooldown_until: '',
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

  /**
   * Recalculate all derived state from a runs array.
   * Pure function — selected = latest non-rejected run's selected values.
   */
  function recalculateFromRuns(runs, productId, category) {
    if (!runs || runs.length === 0) {
      return { ...emptyTemplate(productId, category), runs: [] };
    }

    const sorted = [...runs].sort((a, b) => a.run_number - b.run_number);
    const overallLatest = sorted[sorted.length - 1];
    const maxRunNumber = overallLatest.run_number;

    // WHY: Rejected runs shouldn't determine selected or cooldown.
    const validRuns = sorted.filter(r => r.status !== 'rejected');
    const latestValid = validRuns.length > 0 ? validRuns[validRuns.length - 1] : null;

    return {
      product_id: productId || '',
      category: category || '',
      selected: latestValid?.selected || emptySelected(),
      cooldown_until: latestValid?.cooldown_until || '',
      last_ran_at: overallLatest.ran_at || '',
      run_count: runs.length,
      next_run_number: maxRunNumber + 1,
      runs: sorted,
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
      cooldown_until: newDiscovery.cooldown_until || '',
      ...(run.status ? { status: run.status } : {}),
      selected: run.selected || emptySelected(),
      prompt: run.prompt || { system: '', user: '' },
      response: run.response || emptySelected(),
    };

    const merged = {
      product_id: existing.product_id || productId || '',
      category: existing.category || newDiscovery.category || '',
      // WHY: Rejected runs must not overwrite selected or cooldown.
      selected: run.status === 'rejected' ? (existing.selected || emptySelected()) : runEntry.selected,
      cooldown_until: run.status === 'rejected' ? (existing.cooldown_until || '') : (newDiscovery.cooldown_until || existing.cooldown_until || ''),
      last_ran_at: newDiscovery.last_ran_at || existing.last_ran_at || '',
      run_count: existingRuns.length + 1,
      next_run_number: runNumber + 1,
      runs: [...existingRuns, runEntry],
    };

    write({ productId, productRoot, data: merged });
    return merged;
  }

  /**
   * Delete a single run by run_number. Recalculates selected from remaining runs.
   * Returns updated doc, or null if no runs remain (file deleted).
   */
  function deleteRun({ productId, productRoot, runNumber }) {
    const existing = read({ productId, productRoot });
    if (!existing) return null;

    const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
    const remaining = existingRuns.filter(r => r.run_number !== runNumber);

    if (remaining.length === existingRuns.length) return existing;

    if (remaining.length === 0) {
      const filePath = resolvePath(productId, productRoot);
      try { fs.unlinkSync(filePath); } catch { /* */ }
      return null;
    }

    const recalculated = recalculateFromRuns(remaining, existing.product_id || productId, existing.category);
    write({ productId, productRoot, data: recalculated });
    return recalculated;
  }

  /**
   * Delete all finder data for a product. Removes the JSON file.
   */
  function deleteAll({ productId, productRoot }) {
    const filePath = resolvePath(productId, productRoot);
    try { fs.unlinkSync(filePath); } catch { /* */ }
    return { deleted: true };
  }

  return { read, write, recalculateFromRuns, merge, deleteRun, deleteAll };
}
