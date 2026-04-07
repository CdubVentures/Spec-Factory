const CATEGORY_SEGMENT_SCOPES = new Set([
  'catalog',
  'product',
  'events',
  'llm-settings',
  'queue',
  'billing',
  'learning',
  'studio',
  'data-authority',
  'review',
  'review-components',
]);

const TEST_MODE_ACTION_SEGMENTS = new Set([
  'create',
  'contract-summary',
  'status',
  'generate-products',
  'run',
  'validate',
  'field-test-repairs',
]);

function defaultIsApiRequest(url) {
  const token = String(url || '');
  return token.startsWith('/api/v1/') || token === '/health';
}

function defaultApiErrorLogger(err) {
  console.error('[gui-server] API error:', err?.message);
}

export function createApiPathParser({
  resolveCategoryAlias,
  categorySegmentScopes = CATEGORY_SEGMENT_SCOPES,
  testModeActionSegments = TEST_MODE_ACTION_SEGMENTS,
} = {}) {
  if (typeof resolveCategoryAlias !== 'function') {
    throw new TypeError('resolveCategoryAlias must be a function');
  }

  return function parseApiPath(url) {
    const [pathname, qs] = (url || '/').split('?');
    const params = new URLSearchParams(qs || '');
    const parts = pathname
      .replace(/^\/api\/v1/, '')
      .split('/')
      .filter(Boolean)
      .map((part) => {
        try { return decodeURIComponent(part); } catch { return part; }
      });

    if (parts[1] && categorySegmentScopes.has(parts[0])) {
      parts[1] = resolveCategoryAlias(parts[1]);
    }
    if (parts[0] === 'test-mode' && parts[1] && !testModeActionSegments.has(parts[1])) {
      parts[1] = resolveCategoryAlias(parts[1]);
    }
    if (
      parts[0] === 'indexing'
      && (parts[1] === 'domain-checklist' || parts[1] === 'review-metrics')
      && parts[2]
    ) {
      parts[2] = resolveCategoryAlias(parts[2]);
    }

    return { parts, params, pathname };
  };
}

export function createApiRouteDispatcher({ parsePath, routeHandlers = [] } = {}) {
  if (typeof parsePath !== 'function') {
    throw new TypeError('parsePath must be a function');
  }
  const handlers = routeHandlers.filter((handler) => typeof handler === 'function');

  return async function dispatchApiRoute(req, res) {
    const { parts, params } = parsePath(req.url);
    const method = req.method;

    for (const handler of handlers) {
      const result = await handler(parts, params, method, req, res);
      if (result !== false) return result;
    }

    return null;
  };
}

export function createApiHttpRequestHandler({
  corsHeaders,
  handleApi,
  jsonRes,
  serveStatic,
  isApiRequest = defaultIsApiRequest,
  logApiError = defaultApiErrorLogger,
} = {}) {
  if (typeof corsHeaders !== 'function') throw new TypeError('corsHeaders must be a function');
  if (typeof handleApi !== 'function') throw new TypeError('handleApi must be a function');
  if (typeof jsonRes !== 'function') throw new TypeError('jsonRes must be a function');
  if (typeof serveStatic !== 'function') throw new TypeError('serveStatic must be a function');
  if (typeof isApiRequest !== 'function') throw new TypeError('isApiRequest must be a function');
  if (typeof logApiError !== 'function') throw new TypeError('logApiError must be a function');

  return async function handleHttpRequest(req, res) {
    corsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (isApiRequest(req.url)) {
      try {
        const handled = await handleApi(req, res);
        if (handled === null) {
          jsonRes(res, 404, { error: 'not_found' });
        }
      } catch (err) {
        logApiError(err);
        jsonRes(res, 500, { error: 'internal', message: err?.message });
      }
      return;
    }

    serveStatic(req, res);
  };
}
