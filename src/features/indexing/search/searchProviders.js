function normalizeProvider(value) {
  const token = String(value || '').trim().toLowerCase();
  if (
    token === 'google' ||
    token === 'bing' ||
    token === 'dual' ||
    token === 'searxng' ||
    token === 'none'
  ) {
    return token;
  }
  return 'none';
}

function uniqueTokens(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function activeProvidersForConfig(provider, {
  bingReady,
  googleReady,
  searxngReady
}) {
  if (provider === 'none') {
    return [];
  }

  const active = new Set();
  if (searxngReady) {
    active.add('searxng');
  }
  if (googleReady) {
    active.add('google');
  }
  if (bingReady) {
    active.add('bing');
  }

  if (provider === 'searxng') {
    return searxngReady ? ['searxng'] : [];
  }
  if (provider === 'google') {
    return googleReady ? uniqueTokens(['google', ...(searxngReady ? ['searxng'] : [])]) : [];
  }
  if (provider === 'bing') {
    return bingReady ? uniqueTokens(['bing', ...(searxngReady ? ['searxng'] : [])]) : [];
  }

  return [...active];
}

function dedupeResults(rows = []) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const url = String(row.url || '').trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(row);
  }
  return out;
}

function buildSearchAttemptPlan(provider) {
  if (provider === 'searxng') {
    return [{ providerName: 'searxng', engines: '' }];
  }
  if (provider === 'google') {
    return [
      { providerName: 'google', engines: 'google' },
      { providerName: 'bing_fallback', engines: 'bing' },
      { providerName: 'google_fallback', engines: '' }
    ];
  }
  if (provider === 'bing') {
    return [
      { providerName: 'bing', engines: 'bing' },
      { providerName: 'google_fallback', engines: 'google' },
      { providerName: 'bing_fallback', engines: '' }
    ];
  }
  if (provider === 'dual') {
    return [
      { providerName: 'google', engines: 'google' },
      { providerName: 'bing', engines: 'bing' },
      { providerName: 'searxng', engines: '' }
    ];
  }
  return [];
}

function hostKeyFromUrl(value, fallback = '') {
  try {
    return new URL(String(value || '')).hostname;
  } catch {
    return String(fallback || '').trim();
  }
}

function searxngFallbackBaseUrl(config = {}) {
  const token = String(config.searxngDefaultBaseUrl || '').trim() || 'http://127.0.0.1:8080';
  try {
    const parsed = new URL(token);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return 'http://127.0.0.1:8080';
  }
}

function searxngBaseUrl(config = {}) {
  const token = String(config.searxngBaseUrl || '').trim();
  if (!token) {
    return '';
  }
  try {
    const parsed = new URL(token);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

async function acquireSearchSlot({
  requestThrottler,
  logger,
  provider,
  query,
  baseUrl,
  fallbackKey
}) {
  if (typeof requestThrottler?.acquire !== 'function') {
    return;
  }
  const key = hostKeyFromUrl(baseUrl, fallbackKey);
  const waitMs = Number(await requestThrottler.acquire({ key, provider, query })) || 0;
  if (waitMs > 0) {
    logger?.info?.('search_request_throttled', {
      provider,
      query,
      key,
      wait_ms: waitMs
    });
  }
}

// Module-level pacing to prevent upstream engine rate-limiting (CAPTCHA/ban).
// SearXNG fans out across upstream engines, so rapid queries trigger bans.
let _lastSearxngQueryMs = 0;
const SEARXNG_MIN_QUERY_INTERVAL_MS = 8_000;

function resolveSearxngMinQueryIntervalMs(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return SEARXNG_MIN_QUERY_INTERVAL_MS;
  }
  return parsed;
}

export async function searchSearxng({
  baseUrl,
  query,
  limit = 10,
  timeoutMs = 8_000,
  minQueryIntervalMs = SEARXNG_MIN_QUERY_INTERVAL_MS,
  engines = '',
  provider = 'searxng',
  logger,
  requestThrottler
}) {
  if (!baseUrl || !query) {
    return [];
  }
  await acquireSearchSlot({
    requestThrottler,
    logger,
    provider,
    query,
    baseUrl,
    fallbackKey: '127.0.0.1'
  });
  // Enforce minimum inter-query delay to avoid upstream engine rate-limiting
  const minIntervalMs = resolveSearxngMinQueryIntervalMs(minQueryIntervalMs);
  const now = Date.now();
  const elapsed = now - _lastSearxngQueryMs;
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
  }
  _lastSearxngQueryMs = Date.now();
  const url = new URL('/search', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  url.searchParams.set('safesearch', '0');
  const normalizedEngines = String(engines || '').trim();
  if (normalizedEngines) {
    url.searchParams.set('engines', normalizedEngines);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, Number(timeoutMs || 8_000)));

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    return (payload.results || []).slice(0, Math.max(1, Number(limit || 10))).map((item) => ({
      url: item.url,
      title: item.title || '',
      snippet: item.content || item.snippet || '',
      provider: String(provider || 'searxng').trim() || 'searxng',
      query
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSearchProviders({
  config,
  query,
  limit = 10,
  logger,
  requestThrottler
}) {
  const provider = normalizeProvider(config.searchProvider);
  if (provider === 'none') {
    return [];
  }

  const searxBase = searxngBaseUrl(config);

  async function runSearxngSearch({
    baseUrl = searxBase,
    providerName = 'searxng',
    engines = '',
    timeoutMs = config.searxngTimeoutMs
  } = {}) {
    return searchSearxng({
      baseUrl,
      query,
      limit,
      timeoutMs,
      minQueryIntervalMs: config.searxngMinQueryIntervalMs,
      engines,
      provider: providerName,
      logger,
      requestThrottler
    });
  }

  if (!searxBase) {
    return [];
  }

  const attemptPlan = buildSearchAttemptPlan(provider);
  for (const attempt of attemptPlan) {
    try {
      const rows = await runSearxngSearch({
        providerName: attempt.providerName,
        engines: attempt.engines
      });
      if (rows.length > 0) {
        return dedupeResults(rows);
      }
    } catch (error) {
      logger?.warn?.('search_provider_failed', {
        provider: attempt.providerName,
        query,
        message: error.message
      });
    }
  }

  return [];
}

export function searchProviderAvailability(config) {
  const provider = normalizeProvider(config.searchProvider);
  const searxngReady = Boolean(searxngBaseUrl(config));
  const googleReady = Boolean(searxngReady);
  const bingReady = Boolean(searxngReady);
  const activeProviders = activeProvidersForConfig(provider, {
    bingReady,
    googleReady,
    searxngReady
  });
  let fallbackReason = null;
  if (provider === 'dual') {
    fallbackReason = searxngReady ? 'dual_fallback_searxng_only' : 'no_provider_ready';
  }
  return {
    provider,
    bing_ready: bingReady,
    google_ready: googleReady,
    google_search_ready: googleReady,
    searxng_ready: searxngReady,
    active_providers: activeProviders,
    fallback_reason: fallbackReason,
    internet_ready:
      (provider === 'bing' && bingReady) ||
      (provider === 'google' && googleReady) ||
      (provider === 'searxng' && searxngReady) ||
      (provider === 'dual' && (bingReady || googleReady || searxngReady))
  };
}
