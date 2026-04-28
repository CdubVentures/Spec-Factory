/**
 * Product Image Finder — JSON store wrapper.
 *
 * Uses the generic finderJsonStore but overrides recalculation to
 * ACCUMULATE images across variants instead of latest-wins.
 * Each variant_key's latest non-rejected run wins, but other
 * variants are preserved.
 *
 * `rebuildProductImageFinderFromJson` stays here because it knows PIF-specific
 * column mapping and specDb method names (mirrors CEF pattern).
 *
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import fs from 'node:fs';
import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';
import { extractEvalState, PIF_EVAL_FIELDS } from './imageEvaluator.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const store = createFinderJsonStore({
  filePrefix: 'product_images',
  emptySelected: () => ({ images: [] }),
  // WHY: Override recalculateFromRuns to accumulate ALL images across variants.
  // The generic store uses latest-wins (selected = last non-rejected run).
  // PIF needs every image from every non-rejected run — filenames are unique
  // via the -N suffix, so no dedup is needed. The carousel strategy counts
  // images per view to determine satisfaction.
  recalculateSelected: (runs) => {
    const images = [];
    const sorted = [...runs]
      .filter(r => r.status !== 'rejected')
      .sort((a, b) => a.run_number - b.run_number);

    for (const run of sorted) {
      for (const img of (run.selected?.images || [])) {
        if (img.variant_key) images.push(img);
      }
    }

    return { images };
  },
});

export const readProductImages = store.read;
export const writeProductImages = store.write;
export const mergeProductImageDiscoveryData = store.mergeData;
export const mergeProductImageDiscovery = store.merge;
export const deleteProductImageFinderRun = store.deleteRun;
export const deleteProductImageFinderRuns = store.deleteRuns;
export const deleteProductImageFinderAll = store.deleteAll;
export const recalculateProductImagesFromRuns = store.recalculateFromRuns;

function parseJsonValue(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseJsonArray(value) {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function hydratePifSqlRun(run) {
  return {
    ...run,
    selected: parseJsonValue(run?.selected, run?.selected_json ? parseJsonValue(run.selected_json, {}) : {}),
    prompt: parseJsonValue(run?.prompt, run?.prompt_json ? parseJsonValue(run.prompt_json, {}) : {}),
    response: parseJsonValue(run?.response, run?.response_json ? parseJsonValue(run.response_json, {}) : {}),
  };
}

function collectRunImagesByFilename(runs) {
  const imagesByFilename = new Map();
  for (const run of runs) {
    for (const img of (run.response?.images || [])) {
      if (img?.filename) imagesByFilename.set(img.filename, img);
    }
    for (const img of (run.selected?.images || [])) {
      if (img?.filename) imagesByFilename.set(img.filename, img);
    }
  }
  return imagesByFilename;
}

function collectSelectedImagesFromRuns(runs) {
  return runs.flatMap((run) => Array.isArray(run.selected?.images) ? run.selected.images : []);
}

function overlayEvalState(img, evalState) {
  const filename = String(img?.filename || '');
  const overlay = filename ? evalState?.[filename] : null;
  const baseImage = { ...img };
  for (const field of PIF_EVAL_FIELDS) delete baseImage[field];
  return overlay && typeof overlay === 'object' ? { ...baseImage, ...overlay } : baseImage;
}

export function buildProductImageFinderDocFromSql({ finderStore, productId }) {
  const row = typeof finderStore?.get === 'function' ? finderStore.get(productId) : null;
  const runs = typeof finderStore?.listRuns === 'function'
    ? finderStore.listRuns(productId).map(hydratePifSqlRun)
    : [];
  if (!row && runs.length === 0) return null;

  const evalState = parseJsonValue(row?.eval_state, {});
  const runImagesByFilename = collectRunImagesByFilename(runs);
  const rowImages = parseJsonArray(row?.images);
  const selectedSource = rowImages.length > 0 ? rowImages : collectSelectedImagesFromRuns(runs);
  const images = selectedSource
    .map((img) => {
      const filename = String(img?.filename || '');
      const runImage = filename ? runImagesByFilename.get(filename) : null;
      return runImage ? { ...img, ...runImage } : img;
    })
    .map((img) => overlayEvalState(img, evalState));
  const maxRunNumber = runs.reduce((max, run) => Math.max(max, Number(run.run_number) || 0), 0);
  const runCount = Number(row?.run_count) || runs.length;

  return {
    product_id: row?.product_id || productId,
    category: row?.category || runs.find((run) => run.category)?.category || '',
    selected: { images },
    last_ran_at: row?.latest_ran_at || runs[runs.length - 1]?.ran_at || '',
    run_count: runCount,
    next_run_number: Math.max(maxRunNumber + 1, runCount + 1, 1),
    runs,
    carousel_slots: parseJsonValue(row?.carousel_slots, {}),
    evaluations: parseJsonArray(row?.evaluations),
  };
}

export function readProductImageFinderRuntimeDoc({
  finderStore,
  productId,
  productRoot,
  mirrorSqlToJson = false,
}) {
  const sqlDoc = buildProductImageFinderDocFromSql({ finderStore, productId });
  if (sqlDoc) {
    if (mirrorSqlToJson) writeProductImages({ productId, productRoot, data: sqlDoc });
    return sqlDoc;
  }
  return readProductImages({ productId, productRoot });
}

export function buildProductImageFinderSqlSummaryRow({ category, productId, data, ranAt }) {
  const images = data?.selected?.images || [];
  return {
    category,
    product_id: productId,
    images: images.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })),
    image_count: images.length,
    carousel_slots: JSON.stringify(data?.carousel_slots || {}),
    eval_state: JSON.stringify(extractEvalState(data)),
    evaluations: JSON.stringify(Array.isArray(data?.evaluations) ? data.evaluations : []),
    latest_ran_at: ranAt || data?.last_ran_at || '',
    run_count: data?.run_count || 0,
  };
}

/**
 * Rebuild the product_image_finder SQL table from per-product JSON files.
 * Called on DB delete to satisfy the CLAUDE.md rebuild contract.
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, runs_seeded: number }}
 */
export function rebuildProductImageFinderFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, runs_seeded: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const data = readProductImages({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;

    const finderStore = specDb.getFinderStore('productImageFinder');
    finderStore.upsert(buildProductImageFinderSqlSummaryRow({
      category: data.category,
      productId,
      data,
      ranAt: data.last_ran_at || '',
    }));

    const runs = Array.isArray(data.runs) ? data.runs : [];
    if (typeof finderStore.removeAllRuns === 'function') {
      finderStore.removeAllRuns(productId);
    }
    for (const run of runs) {
      finderStore.insertRun({
        category: data.category,
        product_id: productId,
        run_number: run.run_number,
        ran_at: run.ran_at,
        started_at: run.started_at ?? run.response?.started_at ?? null,
        duration_ms: run.duration_ms ?? run.response?.duration_ms ?? null,
        model: run.model || 'unknown',
        fallback_used: Boolean(run.fallback_used),
        effort_level: run.effort_level || '',
        access_mode: run.access_mode || '',
        thinking: Boolean(run.thinking),
        web_search: Boolean(run.web_search),
        selected: run.selected || {},
        prompt: run.prompt || {},
        response: run.response || {},
      });
    }
    stats.runs_seeded += runs.length;
    stats.seeded++;
  }

  return stats;
}
