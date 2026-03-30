export function createRebuildIndexCommand({
  rebuildCategoryIndex,
  openSpecDbForCategory,
}) {
  return async function commandRebuildIndex(config, storage, args) {
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    try {
      const result = await rebuildCategoryIndex({ storage, config, category, specDb });
      return {
        command: 'rebuild-index',
        category,
        index_key: result.indexKey,
        total_products: result.totalProducts,
      };
    } finally {
      try { specDb?.close(); } catch { /* */ }
    }
  };
}
