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

test('api route dispatcher returns the first matching handler result', async () => {
  const parsePath = () => ({
    parts: ['health'],
    params: new URLSearchParams(),
    pathname: '/health',
  });

  const dispatch = createApiRouteDispatcher({
    parsePath,
    routeHandlers: [
      async () => false,
      async (parts, _params, method) => ({
        status: 200,
        body: { ok: true, parts, method },
      }),
      async () => ({
        status: 500,
        body: { ok: false },
      }),
    ],
  });

  const result = await dispatch({ url: '/health', method: 'GET' }, {});
  assert.deepEqual(result, {
    status: 200,
    body: { ok: true, parts: ['health'], method: 'GET' },
  });
});

test('api http request handler applies preflight, api 404, static fallback, and api error handling', async () => {
  const requestHandler = createApiHttpRequestHandler({
    corsHeaders: (res) => {
      res.corsApplied = true;
    },
    handleApi: async (req) => {
      if (req.url === '/api/v1/throws') {
        throw new Error('forced_failure');
      }
      return null;
    },
    jsonRes: (res, status, body) => {
      res.json = { status, body };
      return res.json;
    },
    serveStatic: (_req, res) => {
      res.staticServed = true;
    },
    logApiError: () => {},
  });

  const optionsRes = createStubRes();
  await requestHandler({ method: 'OPTIONS', url: '/api/v1/health' }, optionsRes);
  assert.equal(optionsRes.corsApplied, true);
  assert.equal(optionsRes.statusCode, 204);
  assert.equal(optionsRes.endCallCount, 1);

  const notFoundRes = createStubRes();
  await requestHandler({ method: 'GET', url: '/api/v1/unknown-route' }, notFoundRes);
  assert.equal(notFoundRes.corsApplied, true);
  assert.deepEqual(notFoundRes.json, {
    status: 404,
    body: { error: 'not_found' },
  });

  const staticRes = createStubRes();
  await requestHandler({ method: 'GET', url: '/dashboard' }, staticRes);
  assert.equal(staticRes.corsApplied, true);
  assert.equal(staticRes.staticServed, true);

  const errorRes = createStubRes();
  await requestHandler({ method: 'GET', url: '/api/v1/throws' }, errorRes);
  assert.equal(errorRes.corsApplied, true);
  assert.deepEqual(errorRes.json, {
    status: 500,
    body: { error: 'internal', message: 'forced_failure' },
  });
});

test('gui api route registry returns handlers in canonical order using each route context', () => {
  const routeCtx = Object.fromEntries(
    GUI_API_ROUTE_ORDER.map((name) => [`${name}RouteContext`, { token: `${name}-ctx` }]),
  );

  const routeDefinitions = GUI_API_ROUTE_ORDER.map((name) => ({
    key: name,
    registrar: (ctx) => () => `${name}:${ctx.token}`,
  }));

  const registry = createGuiApiRouteRegistry({ routeCtx, routeDefinitions });

  assert.deepEqual(
    registry.routeHandlers.map((handler) => handler()),
    GUI_API_ROUTE_ORDER.map((name) => `${name}:${name}-ctx`),
  );
});

test('gui api route registry maps distinct pre-built contexts to the matching route handlers', () => {
  const routeCtx = {
    infraRouteContext: { token: 'infra-ctx' },
    configRouteContext: { token: 'config-ctx' },
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

  const routeDefinitions = GUI_API_ROUTE_ORDER.map((name) => ({
    key: name,
    registrar: (ctx) => () => ctx.token,
  }));

  const registry = createGuiApiRouteRegistry({ routeCtx, routeDefinitions });

  assert.deepEqual(
    registry.routeHandlers.map((handler) => handler()),
    [
      'infra-ctx',
      'config-ctx',
      'indexlab-ctx',
      'runtimeOps-ctx',
      'catalog-ctx',
      'brand-ctx',
      'studio-ctx',
      'dataAuthority-ctx',
      'queueBillingLearning-ctx',
      'review-ctx',
      'testMode-ctx',
      'sourceStrategy-ctx',
    ],
  );
});

test('gui api route registry rejects empty routeDefinitions', () => {
  assert.throws(
    () => createGuiApiRouteRegistry({ routeCtx: {}, routeDefinitions: [] }),
    { message: /routeDefinitions must be a non-empty array/ },
  );
});

test('gui api route registry rejects non-function registrar with key in message', () => {
  assert.throws(
    () => createGuiApiRouteRegistry({
      routeCtx: { badRouteContext: {} },
      routeDefinitions: [{ key: 'bad', registrar: 'not-a-function' }],
    }),
    { message: /registrar for "bad" must be a function/ },
  );
});

test('gui api route registry rejects missing context key', () => {
  assert.throws(
    () => createGuiApiRouteRegistry({
      routeCtx: {},
      routeDefinitions: [{ key: 'missing', registrar: () => () => {} }],
    }),
    { message: /missingRouteContext.*missing/ },
  );
});
