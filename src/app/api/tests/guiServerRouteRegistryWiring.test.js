import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
} from '../requestDispatch.js';
import {
  createGuiApiRouteRegistry,
} from '../routeRegistry.js';
import { createCaptureResponse } from './helpers/appApiTestBuilders.js';

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

  const optionsRes = createCaptureResponse();
  await requestHandler({ method: 'OPTIONS', url: '/api/v1/health' }, optionsRes);
  assert.equal(optionsRes.corsApplied, true);
  assert.equal(optionsRes.statusCode, 204);
  assert.equal(optionsRes.endCallCount, 1);

  const notFoundRes = createCaptureResponse();
  await requestHandler({ method: 'GET', url: '/api/v1/unknown-route' }, notFoundRes);
  assert.equal(notFoundRes.corsApplied, true);
  assert.deepEqual(notFoundRes.json, {
    status: 404,
    body: { error: 'not_found' },
  });

  const staticRes = createCaptureResponse();
  await requestHandler({ method: 'GET', url: '/dashboard' }, staticRes);
  assert.equal(staticRes.corsApplied, true);
  assert.equal(staticRes.staticServed, true);

  const errorRes = createCaptureResponse();
  await requestHandler({ method: 'GET', url: '/api/v1/throws' }, errorRes);
  assert.equal(errorRes.corsApplied, true);
  assert.deepEqual(errorRes.json, {
    status: 500,
    body: { error: 'internal', message: 'forced_failure' },
  });
});

test('gui api route registry returns handlers in definition order with their paired contexts', () => {
  const routeCtx = {
    betaRouteContext: { token: 'beta' },
    alphaRouteContext: { token: 'alpha' },
    gammaRouteContext: { token: 'gamma' },
  };

  const routeDefinitions = ['beta', 'alpha', 'gamma'].map((name) => ({
    key: name,
    registrar: (ctx) => () => ctx.token,
  }));

  const registry = createGuiApiRouteRegistry({ routeCtx, routeDefinitions });

  assert.deepEqual(
    registry.routeHandlers.map((handler) => handler()),
    ['beta', 'alpha', 'gamma'],
  );
});

test('gui api route registry rejects invalid registry definitions', () => {
  assert.throws(
    () => createGuiApiRouteRegistry({ routeCtx: {}, routeDefinitions: [] }),
    { message: /routeDefinitions must be a non-empty array/ },
  );

  assert.throws(
    () => createGuiApiRouteRegistry({
      routeCtx: { badRouteContext: {} },
      routeDefinitions: [{ key: 'bad', registrar: 'not-a-function' }],
    }),
    { message: /registrar for "bad" must be a function/ },
  );

  assert.throws(
    () => createGuiApiRouteRegistry({
      routeCtx: {},
      routeDefinitions: [{ key: 'missing', registrar: () => () => {} }],
    }),
    { message: /missingRouteContext.*missing/ },
  );

  assert.throws(
    () => createGuiApiRouteRegistry({
      routeCtx: { badRouteContext: {} },
      routeDefinitions: [{ key: 'bad', registrar: () => 'not-a-handler' }],
    }),
    { message: /must return a route handler function/ },
  );
});
