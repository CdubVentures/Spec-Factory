export function createRegisteredGuiApiRouteHandlers({
  routeCtx,
  createGuiApiRouteRegistry,
  routeDefinitions,
} = {}) {
  if (typeof createGuiApiRouteRegistry !== 'function') {
    throw new TypeError('createGuiApiRouteRegistry must be a function');
  }

  const registry = createGuiApiRouteRegistry({ routeCtx, routeDefinitions });

  if (!registry || !Array.isArray(registry.routeHandlers)) {
    throw new TypeError('createGuiApiRouteRegistry must return an object with routeHandlers array');
  }

  return registry.routeHandlers;
}
