export const GUI_API_ROUTE_ORDER = [
  'infra',
  'config',
  'indexlab',
  'runtimeOps',
  'catalog',
  'brand',
  'color',
  'colorEditionFinder',
  'studio',
  'dataAuthority',
  'queueBillingLearning',
  'review',
  'sourceStrategy',
];

export function createGuiApiRouteRegistry({ routeCtx, routeDefinitions } = {}) {
  if (!routeCtx || typeof routeCtx !== 'object') {
    throw new TypeError('routeCtx must be an object');
  }
  if (!Array.isArray(routeDefinitions) || routeDefinitions.length === 0) {
    throw new TypeError('routeDefinitions must be a non-empty array');
  }

  const handlersByKey = {};

  for (const { key, registrar } of routeDefinitions) {
    if (typeof registrar !== 'function') {
      throw new TypeError(`registrar for "${key}" must be a function`);
    }
    const ctxKey = `${key}RouteContext`;
    const ctx = routeCtx[ctxKey];
    if (ctx === undefined) {
      throw new TypeError(`routeCtx.${ctxKey} is missing for route "${key}"`);
    }
    const handler = registrar(ctx);
    if (typeof handler !== 'function') {
      throw new TypeError(`registrar for "${key}" must return a route handler function`);
    }
    handlersByKey[key] = handler;
  }

  return {
    ...handlersByKey,
    routeHandlers: routeDefinitions.map(({ key }) => handlersByKey[key]),
  };
}
