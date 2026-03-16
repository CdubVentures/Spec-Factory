function assertFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

export function createGuiApiPipeline({
  resolveCategoryAlias,
  routeHandlers,
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
  corsHeaders,
  jsonRes,
  serveStatic,
} = {}) {
  assertFunction('createApiPathParser', createApiPathParser);
  assertFunction('createApiRouteDispatcher', createApiRouteDispatcher);
  assertFunction('createApiHttpRequestHandler', createApiHttpRequestHandler);

  const parsePath = createApiPathParser({ resolveCategoryAlias });
  const handleApi = createApiRouteDispatcher({
    parsePath,
    routeHandlers,
  });
  const handleHttpRequest = createApiHttpRequestHandler({
    corsHeaders,
    handleApi,
    jsonRes,
    serveStatic,
  });

  return {
    parsePath,
    handleApi,
    handleHttpRequest,
  };
}
