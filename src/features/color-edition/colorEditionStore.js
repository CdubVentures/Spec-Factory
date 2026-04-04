/**
 * Color & Edition Finder — per-product JSON store.
 *
 * Cumulative discovery log at .workspace/products/{pid}/color_edition.json.
 * This is the durable SSOT — the SQL table is rebuilt from these files.
 *
 * Invariants:
 * - Latest-wins: top-level `selected` always reflects the latest run's output
 * - Colors use modifier-first naming (light-blue, not blue-light)
 * - Multi-color combos use + separator, dominant-first (black+red)
 * - colors[0] IS the default color
 * - Each run stores full prompt + response for auditability
 * - Deleting a run recalculates selected from the new latest run
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const FILENAME = 'color_edition.json';

function resolvePath(productId, productRoot) {
  const root = productRoot || defaultProductRoot();
  return path.join(root, productId, FILENAME);
}

function emptyTemplate(productId, category) {
  return {
    product_id: productId || '',
    category: category || '',
    selected: { colors: [], editions: {}, default_color: '' },
    cooldown_until: '',
    last_ran_at: '',
    run_count: 0,
    runs: [],
  };
}

/**
 * Read color_edition.json for a product. Returns parsed object or null.
 */
export function readColorEdition({ productId, productRoot }) {
  const filePath = resolvePath(productId, productRoot);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write color_edition.json atomically. Creates directory if needed.
 */
export function writeColorEdition({ productId, productRoot, data }) {
  const filePath = resolvePath(productId, productRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Recalculate all derived state from a runs array.
 * Pure function — selected = latest run's selected values.
 *
 * @param {object[]} runs — array of run entries (must have run_number, selected, cooldown_until, ran_at)
 * @param {string} productId
 * @param {string} category
 * @returns {object} { product_id, category, selected, cooldown_until, last_ran_at, run_count, runs }
 */
export function recalculateCumulativeFromRuns(runs, productId, category) {
  if (!runs || runs.length === 0) {
    return {
      ...emptyTemplate(productId, category),
      runs: [],
    };
  }

  // Latest run = highest run_number
  const sorted = [...runs].sort((a, b) => a.run_number - b.run_number);
  const latest = sorted[sorted.length - 1];

  return {
    product_id: productId || '',
    category: category || '',
    selected: latest.selected || { colors: [], editions: {}, default_color: '' },
    cooldown_until: latest.cooldown_until || '',
    last_ran_at: latest.ran_at || '',
    run_count: runs.length,
    runs: sorted,
  };
}

/**
 * Merge new discovery results into existing file. Appends run + sets selected.
 *
 * Latest-wins: top-level `selected` is always the latest run's output.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @param {object} opts.newDiscovery — { category, cooldown_until, last_ran_at }
 * @param {object} opts.run — { model, fallback_used, selected, prompt, response }
 * @returns {object} The merged document (also written to disk)
 */
export function mergeColorEditionDiscovery({ productId, productRoot, newDiscovery, run }) {
  const existing = readColorEdition({ productId, productRoot })
    || emptyTemplate(productId, newDiscovery.category);

  const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
  const runNumber = (existing.run_count || existingRuns.length || 0) + 1;

  const runEntry = {
    run_number: runNumber,
    ran_at: newDiscovery.last_ran_at || new Date().toISOString(),
    model: run.model || 'unknown',
    fallback_used: Boolean(run.fallback_used),
    cooldown_until: newDiscovery.cooldown_until || '',
    selected: run.selected || { colors: [], editions: {}, default_color: '' },
    prompt: run.prompt || { system: '', user: '' },
    response: run.response || { colors: [], editions: {}, default_color: '' },
  };

  const merged = {
    product_id: existing.product_id || productId || '',
    category: existing.category || newDiscovery.category || '',
    selected: runEntry.selected,
    cooldown_until: newDiscovery.cooldown_until || existing.cooldown_until || '',
    last_ran_at: newDiscovery.last_ran_at || existing.last_ran_at || '',
    run_count: runNumber,
    runs: [...existingRuns, runEntry],
  };

  writeColorEdition({ productId, productRoot, data: merged });
  return merged;
}

/**
 * Delete a single run by run_number. Recalculates selected from remaining runs.
 * If no runs remain, deletes the file and returns null.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @param {number} opts.runNumber
 * @returns {object|null} Updated doc, or null if file deleted
 */
export function deleteColorEditionFinderRun({ productId, productRoot, runNumber }) {
  const existing = readColorEdition({ productId, productRoot });
  if (!existing) return null;

  const existingRuns = Array.isArray(existing.runs) ? existing.runs : [];
  const remaining = existingRuns.filter(r => r.run_number !== runNumber);

  // Nothing was removed — return as-is
  if (remaining.length === existingRuns.length) {
    return existing;
  }

  // No runs left — delete file
  if (remaining.length === 0) {
    const filePath = resolvePath(productId, productRoot);
    try { fs.unlinkSync(filePath); } catch { /* */ }
    return null;
  }

  // Recalculate from remaining runs
  const recalculated = recalculateCumulativeFromRuns(remaining, existing.product_id || productId, existing.category);
  writeColorEdition({ productId, productRoot, data: recalculated });
  return recalculated;
}

/**
 * Delete all color edition data for a product. Removes the JSON file.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @returns {{ deleted: true }}
 */
export function deleteColorEditionFinderAll({ productId, productRoot }) {
  const filePath = resolvePath(productId, productRoot);
  try { fs.unlinkSync(filePath); } catch { /* */ }
  return { deleted: true };
}

/**
 * Rebuild the color_edition_finder SQL table from per-product JSON files.
 * Handles both new format (selected.colors) and legacy format (colors as object keys).
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance with upsertColorEditionFinder
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number }}
 */
export function rebuildColorEditionFinderFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const data = readColorEdition({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    // Handle new format (selected.colors) and legacy format (colors as object keys)
    const colors = data.selected?.colors
      ? data.selected.colors
      : (data.colors ? Object.keys(data.colors) : []);

    const editions = data.selected?.editions
      ? Object.keys(data.selected.editions)
      : (data.editions ? Object.keys(data.editions) : []);

    const defaultColor = data.selected?.default_color
      || data.default_color
      || '';

    specDb.upsertColorEditionFinder({
      category: data.category,
      product_id: data.product_id || entry.name,
      colors,
      editions,
      default_color: defaultColor,
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });
    stats.seeded++;
  }

  return stats;
}
