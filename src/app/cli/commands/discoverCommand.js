import { filterKeysByBrand } from '../cliHelpers.js';
import { configValue } from '../../../shared/settingsAccessor.js';

export function createDiscoverCommand({
  loadCategoryConfig,
  runDiscoverySeedPlan,
  EventLogger,
  buildRunId,
}) {
  return async function commandDiscover(config, storage, args) {
    const category = args.category || 'mouse';
    const categoryConfig = await loadCategoryConfig(category, { storage, config });
    const allKeys = await storage.listInputKeys(category);
    const keys = await filterKeysByBrand(storage, allKeys, args.brand);
    const logger = new EventLogger({
      storage,
      runtimeEventsKey: configValue(config, 'runtimeEventsKey'),
      context: {
        category,
      },
    });

    const runs = [];
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
        candidates_key: result.candidatesKey,
        candidate_count: result.candidates.length,
      });
    }
    await logger.flush();

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
