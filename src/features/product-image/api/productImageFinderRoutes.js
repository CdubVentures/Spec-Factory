/**
 * Product Image Finder — route handler config.
 *
 * Thin wrapper around the generic finder route handler.
 * All 5 endpoints (GET list, GET single, POST trigger, DELETE run, DELETE all)
 * are provided by the generic handler.
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';

export function registerProductImageFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('productImageFinder');

  return createFinderRouteHandler({
    routePrefix: 'product-image-finder',
    moduleType: 'pif',
    phase: 'imageFinder',
    fieldKeys: [],  // PIF doesn't populate field candidates

    runFinder: ctx.runProductImageFinder,
    deleteRun: ctx.deleteProductImageFinderRun,
    deleteAll: ctx.deleteProductImageFinderAll,

    getOne: (specDb, pid) => store(specDb).get(pid),
    listByCategory: (specDb, cat) => store(specDb).listByCategory(cat),
    listRuns: (specDb, pid) => store(specDb).listRuns(pid),
    upsertSummary: (specDb, row) => store(specDb).upsert(row),
    deleteOneSql: (specDb, pid) => store(specDb).remove(pid),
    deleteRunSql: (specDb, pid, rn) => store(specDb).removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => store(specDb).removeAllRuns(pid),

    buildGetResponse: (row, selected, runs, onCooldown) => ({
      product_id: row.product_id,
      category: row.category,
      images: row.images,
      image_count: row.image_count,
      cooldown_until: row.cooldown_until,
      on_cooldown: onCooldown,
      run_count: row.run_count,
      last_ran_at: row.latest_ran_at,
      selected,
      runs,
    }),

    buildResultMeta: (result) => ({
      imagesDownloaded: Array.isArray(result.images) ? result.images.length : 0,
      downloadErrors: Array.isArray(result.download_errors) ? result.download_errors.length : 0,
    }),
  })(ctx);
}
