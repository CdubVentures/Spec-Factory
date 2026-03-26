export function createRebuildIndexCommand({
  rebuildCategoryIndex,
}) {
  return async function commandRebuildIndex(config, storage, args) {
    // BUG: whitespace-padded CLI categories could target phantom category names.
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const result = await rebuildCategoryIndex({ storage, config, category });
    return {
      command: 'rebuild-index',
      category,
      index_key: result.indexKey,
      total_products: result.totalProducts,
    };
  };
}
