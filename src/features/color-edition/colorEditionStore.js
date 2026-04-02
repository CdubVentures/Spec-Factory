/**
 * Color & Edition Finder — per-product JSON store.
 *
 * Cumulative discovery log at .workspace/products/{pid}/color_edition.json.
 * This is the durable SSOT — the SQL table is rebuilt from these files.
 *
 * Invariants:
 * - First-discovery-wins: existing color/edition attributions are never overwritten
 * - Colors use modifier-first naming (light-blue, not blue-light)
 * - Multi-color combos use + separator, dominant-first (black+red)
 * - run_count increments on every merge
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
    cooldown_until: '',
    default_color: '',
    run_count: 0,
    last_ran_at: '',
    colors: {},
    editions: {},
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
 * Merge new discovery results into existing file. Read-merge-write.
 *
 * First-discovery-wins: existing color/edition keys are never overwritten.
 * run_count increments. Timestamps update to latest.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @param {object} opts.newDiscovery — { category, colors, editions, default_color?, cooldown_until, last_ran_at }
 * @returns {object} The merged document (also written to disk)
 */
export function mergeColorEditionDiscovery({ productId, productRoot, newDiscovery }) {
  const existing = readColorEdition({ productId, productRoot })
    || emptyTemplate(productId, newDiscovery.category);

  // Merge colors — first-discovery-wins
  const mergedColors = { ...existing.colors };
  for (const [name, meta] of Object.entries(newDiscovery.colors || {})) {
    if (!mergedColors[name]) {
      mergedColors[name] = meta;
    }
  }

  // Merge editions — first-discovery-wins
  const mergedEditions = { ...existing.editions };
  for (const [name, meta] of Object.entries(newDiscovery.editions || {})) {
    if (!mergedEditions[name]) {
      mergedEditions[name] = meta;
    }
  }

  const merged = {
    ...existing,
    category: existing.category || newDiscovery.category || '',
    cooldown_until: newDiscovery.cooldown_until || existing.cooldown_until || '',
    default_color: newDiscovery.default_color || existing.default_color || '',
    run_count: (existing.run_count || 0) + 1,
    last_ran_at: newDiscovery.last_ran_at || existing.last_ran_at || '',
    colors: mergedColors,
    editions: mergedEditions,
  };

  writeColorEdition({ productId, productRoot, data: merged });
  return merged;
}

/**
 * Rebuild the color_edition_finder SQL table from per-product JSON files.
 * Scans all product directories for color_edition.json and upserts into specDb.
 * Only seeds rows matching specDb.category.
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

    specDb.upsertColorEditionFinder({
      category: data.category,
      product_id: data.product_id || entry.name,
      colors: Object.keys(data.colors || {}),
      editions: Object.keys(data.editions || {}),
      default_color: data.default_color || '',
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });
    stats.seeded++;
  }

  return stats;
}
