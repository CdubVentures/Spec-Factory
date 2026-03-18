import { filterKeysByBrand } from '../cliHelpers.js';

export function createDiscoverCommand({
  loadCategoryConfig,
  discoverCandidateSources,
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
      runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
      context: {
        category,
      },
    });

    const runs = [];
    for (const key of keys) {
      const job = await storage.readJson(key);
      const runId = buildRunId();
      const result = await discoverCandidateSources({
        config: {
          ...config,
          discoveryEnabled: true,
        },
        storage,
        categoryConfig,
        job,
        runId,
        logger,
        planningHints: {
          missingCriticalFields: categoryConfig.schema?.critical_fields || [],
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
