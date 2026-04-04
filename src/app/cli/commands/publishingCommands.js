export function createPublishingCommands({
  asBool,
  reconcileOrphans,
}) {
  async function commandProductReconcile(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('product-reconcile requires --category <category>');
    }
    const dryRun = asBool(args['dry-run'], true);
    const result = await reconcileOrphans({
      storage,
      category,
      config,
      dryRun
    });
    return result;
  }

  return {
    commandProductReconcile,
  };
}
