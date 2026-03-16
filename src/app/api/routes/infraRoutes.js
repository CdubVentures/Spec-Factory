import { createInfraHealthRoutes } from './infra/healthRoutes.js';
import { createInfraCategoryRoutes } from './infra/categoryRoutes.js';
import { createInfraSearxngRoutes } from './infra/searxngRoutes.js';
import { createInfraProcessRoutes } from './infra/processRoutes.js';
import { createInfraGraphqlRoutes } from './infra/graphqlRoutes.js';

export function registerInfraRoutes(ctx) {
  const routeHandlers = [
    createInfraHealthRoutes(ctx),
    createInfraCategoryRoutes({
      ...ctx,
      pathApi: ctx.path,
    }),
    createInfraSearxngRoutes(ctx),
    createInfraProcessRoutes({
      ...ctx,
      pathApi: ctx.path,
    }),
    createInfraGraphqlRoutes(ctx),
  ];

  return async function handleInfraRoutes(parts, params, method, req, res) {
    for (const handler of routeHandlers) {
      const result = await handler(parts, params, method, req, res);
      if (result !== false) {
        return result;
      }
    }

    return false;
  };
}
