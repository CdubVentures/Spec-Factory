import test from 'node:test';
import assert from 'node:assert/strict';

import { createGuiServerHttpAssembly } from '../guiServerHttpAssembly.js';

test('createGuiServerHttpAssembly preserves canonical route registration and pipeline wiring', () => {
  const routeCtx = { id: 'route-context' };
  const routeDefinitions = [
    { key: 'infra', registrar: 'register-infra' },
    { key: 'config', registrar: 'register-config' },
  ];
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
    routeDefinitions,
    serveStatic,
    resolveCategoryAlias: 'resolve-category-alias',
    createGuiApiRouteRegistry,
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
      routeDefinitions,
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
