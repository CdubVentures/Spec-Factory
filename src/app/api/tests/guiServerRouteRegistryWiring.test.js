import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
} from '../requestDispatch.js';
import {
  createGuiApiRouteRegistry,
  GUI_API_ROUTE_ORDER,
} from '../routeRegistry.js';

function createStubRes() {
  return {
    statusCode: 0,
    endCallCount: 0,
    end() {
      this.endCallCount += 1;
    },
  };
}

test('api path parser aliases scoped category segments', () => {
  const parsePath = createApiPathParser({
    resolveCategoryAlias: (token) => (String(token).toLowerCase() === 'mice' ? 'mouse' : token),
  });

  const catalogPath = parsePath('/api/v1/catalog/mice/list?limit=25');
  assert.deepEqual(catalogPath.parts, ['catalog', 'mouse', 'list']);
  assert.equal(catalogPath.params.get('limit'), '25');

  const testModeCategoryPath = parsePath('/api/v1/test-mode/mice/run');
  assert.deepEqual(testModeCategoryPath.parts, ['test-mode', 'mouse', 'run']);

  const testModeActionPath = parsePath('/api/v1/test-mode/create');
  assert.deepEqual(testModeActionPath.parts, ['test-mode', 'create']);

  const indexingPath = parsePath('/api/v1/indexing/domain-checklist/mice');
  assert.deepEqual(indexingPath.parts, ['indexing', 'domain-checklist', 'mouse']);
});

test('api route dispatcher preserves handler order and first-match semantics', async () => {
  const calls = [];
  const parsePath = () => ({
    parts: ['health'],
    params: new URLSearchParams(),
    pathname: '/health',
  });

  const dispatch = createApiRouteDispatcher({
    parsePath,
    routeHandlers: [
      async () => {
        calls.push('infra');
        return false;
      },
      async (parts, _params, method) => {
        calls.push('config');
        assert.deepEqual(parts, ['health']);
        assert.equal(method, 'GET');
        return { status: 200, body: { ok: true } };
      },
      async () => {
        calls.push('indexlab');
        return { status: 500 };
      },
    ],
  });

  const result = await dispatch({ url: '/health', method: 'GET' }, {});
  assert.deepEqual(calls, ['infra', 'config']);
  assert.deepEqual(result, { status: 200, body: { ok: true } });
});

test('api http request handler applies preflight, api 404, static fallback, and api error handling', async () => {
  let corsCount = 0;
  let staticCount = 0;
  let apiCount = 0;
  const jsonCalls = [];
  const logCalls = [];

  const requestHandler = createApiHttpRequestHandler({
    corsHeaders: () => {
      corsCount += 1;
    },
    handleApi: async (req) => {
      apiCount += 1;
      if (req.url === '/api/v1/throws') {
        throw new Error('forced_failure');
      }
      return null;
    },
    jsonRes: (_res, status, body) => {
      jsonCalls.push({ status, body });
      return { status, body };
    },
    serveStatic: () => {
      staticCount += 1;
    },
    logApiError: (err) => {
      logCalls.push(err?.message || '');
    },
  });

  const optionsRes = createStubRes();
  await requestHandler({ method: 'OPTIONS', url: '/api/v1/health' }, optionsRes);
  assert.equal(optionsRes.statusCode, 204);
  assert.equal(optionsRes.endCallCount, 1);
  assert.equal(apiCount, 0);
  assert.equal(staticCount, 0);

  await requestHandler({ method: 'GET', url: '/api/v1/unknown-route' }, createStubRes());
  assert.equal(apiCount, 1);
  assert.deepEqual(jsonCalls[0], { status: 404, body: { error: 'not_found' } });

  await requestHandler({ method: 'GET', url: '/dashboard' }, createStubRes());
  assert.equal(staticCount, 1);

  await requestHandler({ method: 'GET', url: '/api/v1/throws' }, createStubRes());
  assert.equal(apiCount, 2);
  assert.equal(logCalls.includes('forced_failure'), true);
  assert.deepEqual(jsonCalls[1], {
    status: 500,
    body: { error: 'internal', message: 'forced_failure' },
  });

  assert.equal(corsCount, 4);
});

test('gui api route registry wires handlers in canonical order using pre-built contexts', () => {
  const registrationCalls = [];
  const routeCtx = Object.fromEntries(
    GUI_API_ROUTE_ORDER.map((name) => [`${name}RouteContext`, { _sentinel: name }]),
  );

  const makeRegistrar = (name) => (ctx) => {
    registrationCalls.push({ name, ctx });
    return () => name;
  };

  const registry = createGuiApiRouteRegistry({
    routeCtx,
    registerInfraRoutes: makeRegistrar('infra'),
    registerConfigRoutes: makeRegistrar('config'),
    registerIndexlabRoutes: makeRegistrar('indexlab'),
    registerRuntimeOpsRoutes: makeRegistrar('runtimeOps'),
    registerCatalogRoutes: makeRegistrar('catalog'),
    registerBrandRoutes: makeRegistrar('brand'),
    registerStudioRoutes: makeRegistrar('studio'),
    registerDataAuthorityRoutes: makeRegistrar('dataAuthority'),
    registerQueueBillingLearningRoutes: makeRegistrar('queueBillingLearning'),
    registerReviewRoutes: makeRegistrar('review'),
    registerTestModeRoutes: makeRegistrar('testMode'),
    registerSourceStrategyRoutes: makeRegistrar('sourceStrategy'),
  });

  assert.equal(registrationCalls.length, GUI_API_ROUTE_ORDER.length);

  // Each registrar receives its own pre-built context object (not the full routeCtx)
  for (const call of registrationCalls) {
    assert.equal(call.ctx, routeCtx[`${call.name}RouteContext`],
      `${call.name} should receive its pre-built context`);
  }

  const routeOrderFromHandlers = registry.routeHandlers.map((handler) => handler());
  assert.deepEqual(routeOrderFromHandlers, GUI_API_ROUTE_ORDER);
});

test('gui api route registry passes each pre-built context to the correct registrar', () => {
  const registrationCalls = [];
  const infraCtx = { token: 'infra-ctx' };
  const configCtx = { token: 'config-ctx' };
  const routeCtx = {
    infraRouteContext: infraCtx,
    configRouteContext: configCtx,
    indexlabRouteContext: { token: 'indexlab-ctx' },
    runtimeOpsRouteContext: { token: 'runtimeOps-ctx' },
    catalogRouteContext: { token: 'catalog-ctx' },
    brandRouteContext: { token: 'brand-ctx' },
    studioRouteContext: { token: 'studio-ctx' },
    dataAuthorityRouteContext: { token: 'dataAuthority-ctx' },
    queueBillingLearningRouteContext: { token: 'queueBillingLearning-ctx' },
    reviewRouteContext: { token: 'review-ctx' },
    testModeRouteContext: { token: 'testMode-ctx' },
    sourceStrategyRouteContext: { token: 'sourceStrategy-ctx' },
  };

  const makeRegistrar = (name) => (ctx) => {
    registrationCalls.push({ name, ctx });
    return () => name;
  };

  createGuiApiRouteRegistry({
    routeCtx,
    registerInfraRoutes: makeRegistrar('infra'),
    registerConfigRoutes: makeRegistrar('config'),
    registerIndexlabRoutes: makeRegistrar('indexlab'),
    registerRuntimeOpsRoutes: makeRegistrar('runtimeOps'),
    registerCatalogRoutes: makeRegistrar('catalog'),
    registerBrandRoutes: makeRegistrar('brand'),
    registerStudioRoutes: makeRegistrar('studio'),
    registerDataAuthorityRoutes: makeRegistrar('dataAuthority'),
    registerQueueBillingLearningRoutes: makeRegistrar('queueBillingLearning'),
    registerReviewRoutes: makeRegistrar('review'),
    registerTestModeRoutes: makeRegistrar('testMode'),
    registerSourceStrategyRoutes: makeRegistrar('sourceStrategy'),
  });

  assert.equal(
    registrationCalls.find((call) => call.name === 'infra')?.ctx,
    infraCtx,
  );
  assert.equal(
    registrationCalls.find((call) => call.name === 'config')?.ctx,
    configCtx,
  );

  // No registrar receives the full routeCtx
  for (const call of registrationCalls) {
    assert.notEqual(call.ctx, routeCtx, `${call.name} should get its pre-built context, not the full routeCtx`);
  }
});
