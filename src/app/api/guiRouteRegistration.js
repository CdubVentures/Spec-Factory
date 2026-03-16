export function createRegisteredGuiApiRouteHandlers({
  routeCtx,
  createGuiApiRouteRegistry,
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
  if (typeof createGuiApiRouteRegistry !== 'function') {
    throw new TypeError('createGuiApiRouteRegistry must be a function');
  }

  const registry = createGuiApiRouteRegistry({
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
  });

  if (!registry || !Array.isArray(registry.routeHandlers)) {
    throw new TypeError('createGuiApiRouteRegistry must return an object with routeHandlers array');
  }

  return registry.routeHandlers;
}
