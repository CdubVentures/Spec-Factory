import { createInfraHealthRoutes } from './infra/healthRoutes.js';
import { createInfraCategoryRoutes } from './infra/categoryRoutes.js';
import { createInfraSearxngRoutes } from './infra/searxngRoutes.js';
import { createInfraSerperRoutes } from './infra/serperRoutes.js';
import { createInfraProcessRoutes } from './infra/processRoutes.js';
import { createInfraGraphqlRoutes } from './infra/graphqlRoutes.js';
import { createInfraOperationsRoutes } from './infra/operationsRoutes.js';
import { scaffoldCategory } from '../../../field-rules/compilerCategoryInit.js';

export function registerInfraRoutes(ctx) {
  const routeHandlers = [
    createInfraHealthRoutes(ctx),
    createInfraCategoryRoutes({
      ...ctx,
      pathApi: ctx.path,
      scaffoldCategoryFn: ctx.scaffoldCategoryFn || scaffoldCategory,
    }),
    createInfraSearxngRoutes(ctx),
    createInfraSerperRoutes(ctx),
    createInfraProcessRoutes({
      ...ctx,
      pathApi: ctx.path,
    }),
    createInfraGraphqlRoutes(ctx),
    createInfraOperationsRoutes(ctx),
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
