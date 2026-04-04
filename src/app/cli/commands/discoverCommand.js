import { filterKeysByBrand } from '../cliHelpers.js';
import { configValue } from '../../../shared/settingsAccessor.js';

export function createDiscoverCommand({
  loadCategoryConfig,
  runDiscoverySeedPlan,
  EventLogger,
  buildRunId,
  openSpecDbForCategory,
}) {
  return async function commandDiscover(config, storage, args) {
    const category = args.category || 'mouse';
    const categoryConfig = await loadCategoryConfig(category, { storage, config });
    // WHY: SQL is the source of truth for products — no fixture scan needed.
    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    const allProducts = specDb ? specDb.getAllProducts() : [];
    const allKeys = allProducts.map((p) => p.product_id);
    const keys = await filterKeysByBrand(storage, allKeys, args.brand);
    const logger = new EventLogger({
      storage,
      context: {
        category,
      },
    });

    const runs = [];
    try {
      for (const key of keys) {
        const job = await storage.readJson(key);
        const runId = buildRunId();
        const result = await runDiscoverySeedPlan({
          config,
          storage,
          category,
          categoryConfig,
          job,
          runId,
          logger,
          roundContext: {
            missing_critical_fields: categoryConfig.schema?.critical_fields || [],
          },
        });

        runs.push({
          key,
          productId: job.productId,
          runId,
          candidate_count: result.candidates.length,
        });
      }
    } finally {
      // BUG: discovery failures previously skipped logger.flush(), dropping
      // buffered runtime events for the failed command invocation.
      await logger.flush();
    }

    return {
      command: 'discover',
      category,
      brand: args.brand || null,
      total_inputs: allKeys.length,
      selected_inputs: keys.length,
      runs,
    };
  };
}
