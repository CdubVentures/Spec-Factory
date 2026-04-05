export function createGuiServerHttpAssembly({
  routeCtx,
  routeDefinitions,
  serveStatic,
  resolveCategoryAlias,
  createGuiApiRouteRegistry,
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
    routeDefinitions,
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
