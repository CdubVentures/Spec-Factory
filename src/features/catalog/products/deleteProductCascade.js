/**
 * Product Delete Cascade — full cleanup when a product is removed.
 *
 * WHY: Catalog delete only removed the products row. This orchestrator
 * calls all existing cleanup methods to remove finder data, variants,
 * candidates, pipeline history, and the product folder on disk.
 *
 * Each step is best-effort — partial failure doesn't block subsequent steps.
 */

import fs from 'node:fs';
import path from 'node:path';
import { FINDER_MODULES } from '../../../core/finder/finderModuleRegistry.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

/**
 * @param {{ specDb, productId: string, category: string, createDeletionStore?: Function, productRoot?: string }} opts
 * @returns {{ ok: boolean, product_id?: string, error?: string, cascade?: object }}
 */
export function deleteProductCascade({ specDb, productId, category, createDeletionStore: createDs = null, productRoot = null }) {
  const pid = String(productId || '').trim();
  const cat = String(category || '').trim();
  if (!specDb) return { ok: false, error: 'specDb_required' };
  if (!pid) return { ok: false, error: 'product_id_required' };

  const cascade = {
    finder_runs_deleted: 0,
    finder_summaries_deleted: 0,
    variants_deleted: false,
    field_candidates_deleted: false,
    pipeline_result: null,
    product_dir_deleted: false,
  };

  // Step 1: Finder runs + summaries (all registered modules)
  for (const mod of FINDER_MODULES) {
    try {
      const store = specDb.getFinderStore?.(mod.id);
      if (store) {
        store.removeAllRuns(pid);
        cascade.finder_runs_deleted += 1;
        store.remove(pid);
        cascade.finder_summaries_deleted += 1;
      }
    } catch { /* best-effort */ }
  }

  // Step 2: Variants
  try {
    specDb.variants?.removeByProduct?.(pid);
    cascade.variants_deleted = true;
  } catch { /* best-effort */ }

  // Step 3: Field candidates
  try {
    specDb.deleteFieldCandidatesByProduct?.(pid);
    cascade.field_candidates_deleted = true;
  } catch { /* best-effort */ }

  // Step 4: Pipeline history (runs, crawl_sources, telemetry, etc.)
  try {
    if (createDs && specDb.db) {
      const ds = createDs({ db: specDb.db, category: specDb.category || cat });
      const root = productRoot || defaultProductRoot();
      cascade.pipeline_result = ds.deleteProductHistory({
        productId: pid,
        category: cat,
        fsRoots: {
          runs: path.resolve('.workspace', 'runs'),
          output: path.resolve('.workspace', 'output'),
          products: root,
        },
      });
    }
  } catch { /* best-effort */ }

  // Step 5: Delete entire product folder (product.json, color_edition.json, product_images.json, images/)
  try {
    const root = productRoot || defaultProductRoot();
    const productDir = path.join(root, pid);
    if (fs.existsSync(productDir)) {
      fs.rmSync(productDir, { recursive: true, force: true });
      cascade.product_dir_deleted = true;
    }
  } catch { /* best-effort */ }

  return { ok: true, product_id: pid, cascade };
}
