export const GUI_API_ROUTE_ORDER = [
  'infra',
  'config',
  'indexlab',
  'runtimeOps',
  'catalog',
  'brand',
  'studio',
  'dataAuthority',
  'queueBillingLearning',
  'review',
  'testMode',
  'sourceStrategy',
];

function assertRegistrar(name, registrar) {
  if (typeof registrar !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertRouteHandler(name, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`${name} must return a route handler function`);
  }
}

export function createGuiApiRouteRegistry({
  routeCtx,
  registerInfraRoutes,
  registerConfigRoutes,
  registerIndexlabRoutes,
  registerRuntimeOpsRoutes,
  registerCatalogRoutes,
  registerBrandRoutes,
  registerStudioRoutes,
  registerDataAuthorityRoutes,
  registerQueueBillingLearningRoutes,
  registerReviewRoutes,
  registerTestModeRoutes,
  registerSourceStrategyRoutes,
} = {}) {
  if (!routeCtx || typeof routeCtx !== 'object') {
    throw new TypeError('routeCtx must be an object');
  }

  assertRegistrar('registerInfraRoutes', registerInfraRoutes);
  assertRegistrar('registerConfigRoutes', registerConfigRoutes);
  assertRegistrar('registerIndexlabRoutes', registerIndexlabRoutes);
  assertRegistrar('registerRuntimeOpsRoutes', registerRuntimeOpsRoutes);
  assertRegistrar('registerCatalogRoutes', registerCatalogRoutes);
  assertRegistrar('registerBrandRoutes', registerBrandRoutes);
  assertRegistrar('registerStudioRoutes', registerStudioRoutes);
  assertRegistrar('registerDataAuthorityRoutes', registerDataAuthorityRoutes);
  assertRegistrar('registerQueueBillingLearningRoutes', registerQueueBillingLearningRoutes);
  assertRegistrar('registerReviewRoutes', registerReviewRoutes);
  assertRegistrar('registerTestModeRoutes', registerTestModeRoutes);
  assertRegistrar('registerSourceStrategyRoutes', registerSourceStrategyRoutes);

  const handlersByKey = {
    infra: registerInfraRoutes(routeCtx.infraRouteContext),
    config: registerConfigRoutes(routeCtx.configRouteContext),
    indexlab: registerIndexlabRoutes(routeCtx.indexlabRouteContext),
    runtimeOps: registerRuntimeOpsRoutes(routeCtx.runtimeOpsRouteContext),
    catalog: registerCatalogRoutes(routeCtx.catalogRouteContext),
    brand: registerBrandRoutes(routeCtx.brandRouteContext),
    studio: registerStudioRoutes(routeCtx.studioRouteContext),
    dataAuthority: registerDataAuthorityRoutes(routeCtx.dataAuthorityRouteContext),
    queueBillingLearning: registerQueueBillingLearningRoutes(routeCtx.queueBillingLearningRouteContext),
    review: registerReviewRoutes(routeCtx.reviewRouteContext),
    testMode: registerTestModeRoutes(routeCtx.testModeRouteContext),
    sourceStrategy: registerSourceStrategyRoutes(routeCtx.sourceStrategyRouteContext),
  };

  for (const routeKey of GUI_API_ROUTE_ORDER) {
    assertRouteHandler(routeKey, handlersByKey[routeKey]);
  }

  return {
    ...handlersByKey,
    routeHandlers: GUI_API_ROUTE_ORDER.map((routeKey) => handlersByKey[routeKey]),
  };
}
