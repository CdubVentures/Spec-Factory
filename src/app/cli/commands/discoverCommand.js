export function createDiscoverCommand({
  loadCategoryConfig,
  runDiscoverySeedPlan,
  EventLogger,
  buildRunId,
  withSpecDb,
}) {
  return async function commandDiscover(config, storage, args) {
    const category = args.category || 'mouse';
    const categoryConfig = await loadCategoryConfig(category, { storage, config });

    return withSpecDb(config, category, async (specDb) => {
      const allProducts = specDb ? specDb.getAllProducts() : [];

      // Filter by brand using DB rows directly — no storage re-reads needed.
      const brand = String(args.brand || '').trim().toLowerCase();
      const filtered = brand
        ? allProducts.filter((p) => String(p.brand || '').trim().toLowerCase() === brand)
        : allProducts;
      const allKeys = allProducts.map((p) => p.product_id);
      const keys = filtered.map((p) => p.product_id);

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
    });
  };
}
