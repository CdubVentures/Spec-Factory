export function createSourcesPlanCommand({
  loadCategoryConfig,
  generateSourceExpansionPlans,
}) {
  return async function commandSourcesPlan(config, storage, args) {
    // BUG: whitespace-padded CLI categories could target phantom category names.
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const categoryConfig = await loadCategoryConfig(category, { storage, config });
    const result = await generateSourceExpansionPlans({
      storage,
      config,
      category,
      categoryConfig,
    });

    return {
      command: 'sources-plan',
      category,
      expansion_plan_key: result.expansionPlanKey,
      brand_plan_count: result.planCount,
      brand_plan_keys: result.brandPlanKeys,
    };
  };
}
