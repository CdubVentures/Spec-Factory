export function createRebuildIndexCommand({
  rebuildCategoryIndex,
}) {
  return async function commandRebuildIndex(config, storage, args) {
    const category = args.category || 'mouse';
    const result = await rebuildCategoryIndex({ storage, config, category });
    return {
      command: 'rebuild-index',
      category,
      index_key: result.indexKey,
      total_products: result.totalProducts,
    };
  };
}
