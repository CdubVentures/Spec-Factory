export async function persistSelfImproveLearningStores({
  config = {},
  learningGateResult = {},
  provenance = {},
  category = '',
  runId = '',
  runtimeFieldRulesEngine = null,
  logger,
  importSpecDbFn,
  createUrlMemoryStoreFn,
  createDomainFieldYieldStoreFn,
  createFieldAnchorsStoreFn,
  createComponentLexiconStoreFn,
  populateLearningStoresFn,
} = {}) {
  if (!config.selfImproveEnabled) return;
  if (!Array.isArray(learningGateResult?.acceptedUpdates) || learningGateResult.acceptedUpdates.length === 0) return;

  let learningDb = null;
  try {
    const { SpecDb } = await importSpecDbFn();
    const categoryToken = String(category || '').trim().toLowerCase();
    const dbPath = `${String(config.specDbDir || '.specfactory_tmp').replace(/[\\\/]+$/, '')}/${categoryToken}/spec.sqlite`;
    learningDb = new SpecDb({ dbPath, category: categoryToken });
    const learningStores = {
      urlMemory: new createUrlMemoryStoreFn(learningDb.db),
      domainFieldYield: new createDomainFieldYieldStoreFn(learningDb.db),
      fieldAnchors: new createFieldAnchorsStoreFn(learningDb.db),
      componentLexicon: new createComponentLexiconStoreFn(learningDb.db),
    };
    populateLearningStoresFn({
      gateResults: learningGateResult.gateResults,
      acceptedUpdates: learningGateResult.acceptedUpdates,
      provenance,
      category,
      runId,
      stores: learningStores,
      fieldRulesEngine: runtimeFieldRulesEngine,
    });
  } catch (learningStoreErr) {
    logger.warn('learning_store_populate_failed', {
      category,
      runId,
      message: learningStoreErr?.message || 'unknown_error',
    });
  } finally {
    try { learningDb?.close?.(); } catch {}
  }
}
