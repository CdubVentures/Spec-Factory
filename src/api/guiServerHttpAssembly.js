export function createGuiServerHttpAssembly({
  routeCtx,
  serveStatic,
  resolveCategoryAlias,
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
  createRegisteredGuiApiRouteHandlers,
  createGuiApiPipeline,
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
  corsHeaders,
  jsonRes,
}) {
  const registeredApiRouteHandlers = createRegisteredGuiApiRouteHandlers({
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
  });

  const { handleApi, handleHttpRequest } = createGuiApiPipeline({
    resolveCategoryAlias,
    routeHandlers: registeredApiRouteHandlers,
    createApiPathParser,
    createApiRouteDispatcher,
    createApiHttpRequestHandler,
    corsHeaders,
    jsonRes,
    serveStatic,
  });

  return {
    registeredApiRouteHandlers,
    handleApi,
    handleHttpRequest,
  };
}
