export async function loadLearningStoreHintsForRun({
  config = {},
  category = '',
  roundContext = null,
  requiredFields = [],
  categoryConfig = {},
  importSpecDbFn = async () => ({}),
  createUrlMemoryStoreFn = () => ({}),
  createDomainFieldYieldStoreFn = () => ({}),
  createFieldAnchorsStoreFn = () => ({}),
  createComponentLexiconStoreFn = () => ({}),
  normalizeFieldListFn = (fields = []) => fields,
  readLearningHintsFromStoresFn = () => null,
} = {}) {
  if (!config.selfImproveEnabled) {
    return null;
  }

  let learningReadDb = null;

  try {
    const { SpecDb } = await importSpecDbFn();
    const categoryToken = String(category || '').trim().toLowerCase();
    const dbPath = `${String(config.specDbDir || '.specfactory_tmp').replace(/[\\\/]+$/, '')}/${categoryToken}/spec.sqlite`;
    learningReadDb = new SpecDb({ dbPath, category: categoryToken });

    const stores = {
      urlMemory: createUrlMemoryStoreFn(learningReadDb.db),
      domainFieldYield: createDomainFieldYieldStoreFn(learningReadDb.db),
      fieldAnchors: createFieldAnchorsStoreFn(learningReadDb.db),
      componentLexicon: createComponentLexiconStoreFn(learningReadDb.db),
    };
    const focusFields = normalizeFieldListFn(
      roundContext?.missing_required_fields || requiredFields || [],
      { fieldOrder: categoryConfig.fieldOrder || [] },
    );

    return readLearningHintsFromStoresFn({
      stores,
      category: categoryToken,
      focusFields,
      config,
    });
  } catch {
    return null;
  } finally {
    try {
      learningReadDb?.close?.();
    } catch {
      // Learning hint readback is best effort.
    }
  }
}
