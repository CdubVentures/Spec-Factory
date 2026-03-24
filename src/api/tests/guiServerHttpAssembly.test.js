import test from 'node:test';
import assert from 'node:assert/strict';

import { createGuiServerHttpAssembly } from '../guiServerHttpAssembly.js';

test('createGuiServerHttpAssembly preserves canonical route registration and pipeline wiring', () => {
  const routeCtx = { id: 'route-context' };
  const serveStatic = () => 'served';
  const registerCalls = [];
  const pipelineCalls = [];
  const createGuiApiRouteRegistry = () => ({ id: 'registry' });
  const createRegisteredGuiApiRouteHandlers = (input) => {
    registerCalls.push(input);
    return ['handler-a', 'handler-b'];
  };
  const createGuiApiPipeline = (input) => {
    pipelineCalls.push(input);
    return {
      handleApi: 'handle-api',
      handleHttpRequest: 'handle-http-request',
    };
  };

  const result = createGuiServerHttpAssembly({
    routeCtx,
    serveStatic,
    resolveCategoryAlias: 'resolve-category-alias',
    createGuiApiRouteRegistry,
    registerInfraRoutes: 'register-infra',
    registerConfigRoutes: 'register-config',
    registerIndexlabRoutes: 'register-indexlab',
    registerRuntimeOpsRoutes: 'register-runtime-ops',
    registerCatalogRoutes: 'register-catalog',
    registerBrandRoutes: 'register-brand',
    registerStudioRoutes: 'register-studio',
    registerDataAuthorityRoutes: 'register-data-authority',
    registerQueueBillingLearningRoutes: 'register-queue-billing-learning',
    registerReviewRoutes: 'register-review',
    registerTestModeRoutes: 'register-test-mode',
    registerSourceStrategyRoutes: 'register-source-strategy',
    createRegisteredGuiApiRouteHandlers,
    createGuiApiPipeline,
    createApiPathParser: 'create-api-path-parser',
    createApiRouteDispatcher: 'create-api-route-dispatcher',
    createApiHttpRequestHandler: 'create-api-http-request-handler',
    corsHeaders: { 'access-control-allow-origin': '*' },
    jsonRes: 'json-responder',
  });

  assert.deepEqual(registerCalls, [
    {
      routeCtx,
      createGuiApiRouteRegistry,
      registerInfraRoutes: 'register-infra',
      registerConfigRoutes: 'register-config',
      registerIndexlabRoutes: 'register-indexlab',
      registerRuntimeOpsRoutes: 'register-runtime-ops',
      registerCatalogRoutes: 'register-catalog',
      registerBrandRoutes: 'register-brand',
      registerStudioRoutes: 'register-studio',
      registerDataAuthorityRoutes: 'register-data-authority',
      registerQueueBillingLearningRoutes: 'register-queue-billing-learning',
      registerReviewRoutes: 'register-review',
      registerTestModeRoutes: 'register-test-mode',
      registerSourceStrategyRoutes: 'register-source-strategy',
    },
  ]);
  assert.deepEqual(pipelineCalls, [
    {
      resolveCategoryAlias: 'resolve-category-alias',
      routeHandlers: ['handler-a', 'handler-b'],
      createApiPathParser: 'create-api-path-parser',
      createApiRouteDispatcher: 'create-api-route-dispatcher',
      createApiHttpRequestHandler: 'create-api-http-request-handler',
      corsHeaders: { 'access-control-allow-origin': '*' },
      jsonRes: 'json-responder',
      serveStatic,
    },
  ]);
  assert.deepEqual(result, {
    registeredApiRouteHandlers: ['handler-a', 'handler-b'],
    handleApi: 'handle-api',
    handleHttpRequest: 'handle-http-request',
  });
});
