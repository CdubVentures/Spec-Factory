import test from 'node:test';
import assert from 'node:assert/strict';

import { createGuiServerHttpAssembly } from '../guiServerHttpAssembly.js';

function createGuiServerHttpAssemblyHarness({
  registeredApiRouteHandlers = ['handler-a', 'handler-b'],
  handleApi = 'handle-api',
  handleHttpRequest = 'handle-http-request',
} = {}) {
  return createGuiServerHttpAssembly({
    routeCtx: { id: 'route-context' },
    routeDefinitions: [
      { key: 'infra', registrar: 'register-infra' },
      { key: 'config', registrar: 'register-config' },
    ],
    serveStatic: () => 'served',
    resolveCategoryAlias: 'resolve-category-alias',
    createGuiApiRouteRegistry: () => ({ id: 'registry' }),
    createRegisteredGuiApiRouteHandlers: () => registeredApiRouteHandlers,
    createGuiApiPipeline: () => ({
      handleApi,
      handleHttpRequest,
    }),
    createApiPathParser: 'create-api-path-parser',
    createApiRouteDispatcher: 'create-api-route-dispatcher',
    createApiHttpRequestHandler: 'create-api-http-request-handler',
    corsHeaders: { 'access-control-allow-origin': '*' },
    jsonRes: 'json-responder',
  });
}

test('createGuiServerHttpAssembly returns the registered handlers and HTTP handlers', () => {
  const result = createGuiServerHttpAssemblyHarness();

  assert.deepEqual(result, {
    registeredApiRouteHandlers: ['handler-a', 'handler-b'],
    handleApi: 'handle-api',
    handleHttpRequest: 'handle-http-request',
  });
});

test('createGuiServerHttpAssembly preserves empty route handler sets in the returned contract', () => {
  const result = createGuiServerHttpAssemblyHarness({
    registeredApiRouteHandlers: [],
    handleApi: () => false,
    handleHttpRequest: () => false,
  });

  assert.deepEqual(result.registeredApiRouteHandlers, []);
  assert.equal(typeof result.handleApi, 'function');
  assert.equal(typeof result.handleHttpRequest, 'function');
});
