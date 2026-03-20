import { SEARXNG_AVAILABLE_ENGINES } from '../../../shared/settingsDefaults.js';

// WHY: Our app uses 'google-proxy' but SearXNG knows it as 'startpage'.
// Translate at the SearXNG boundary so both sides use their own vocabulary.
const TO_SEARXNG = { 'google-proxy': 'startpage' };
const FROM_SEARXNG = { startpage: 'google-proxy' };

function toSearxngEngines(csv) {
  return csv.split(',').map(e => TO_SEARXNG[e] || e).join(',');
}

function fromSearxngEngine(name) {
  return FROM_SEARXNG[name] || name;
}

// WHY: Legacy migration map for old searchProvider enum values → new searchEngines CSV.
const LEGACY_MIGRATION_MAP = {
  dual: 'bing,google',
  google: 'google',
  bing: 'bing',
  searxng: 'bing,google-proxy,duckduckgo',
  none: '',
};

export function normalizeSearchEngines(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '') return '';
  // Legacy enum migration
  if (Object.hasOwn(LEGACY_MIGRATION_MAP, raw)) {
    return LEGACY_MIGRATION_MAP[raw];
  }
  // CSV: split, validate each token against SSOT, dedup, rejoin
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const seen = new Set();
  const valid = [];
  for (const token of tokens) {
    if (SEARXNG_AVAILABLE_ENGINES.includes(token) && !seen.has(token)) {
      seen.add(token);
      valid.push(token);
    }
  }
  return valid.join(',');
}

// WHY: Bing (and occasionally other engines) serve anti-bot/CAPTCHA pages
// when they detect automated scraping. SearXNG parses whatever links are on
// that page (sidebar ads, footer links, random content) and returns them as
// "results." These garbage results share no query terms in title/url/snippet.
// We detect per-engine: if >50% of an engine's results have zero query-word
// overlap, that engine's batch is poisoned and all its results are dropped.
function filterGarbageEngineResults(rows, query) {
  if (!rows.length || !query) return rows;
  const queryWords = String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!queryWords.length) return rows;

  // Group results by engine
  const byEngine = new Map();
  for (const row of rows) {
    const eng = row.provider || 'unknown';
    if (!byEngine.has(eng)) byEngine.set(eng, []);
    byEngine.get(eng).push(row);
  }

  const poisonedEngines = new Set();
  for (const [eng, engineRows] of byEngine) {
    if (engineRows.length < 2) continue;
    let misses = 0;
    for (const row of engineRows) {
      const haystack = `${row.title} ${row.url} ${row.snippet}`.toLowerCase();
      const hit = queryWords.some(w => haystack.includes(w));
      if (!hit) misses++;
    }
    if (misses / engineRows.length > 0.5) {
      poisonedEngines.add(eng);
    }
  }

  if (!poisonedEngines.size) return rows;
  return rows.filter(row => !poisonedEngines.has(row.provider || 'unknown'));
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

function hostKeyFromUrl(value, fallback = '') {
  try {
    return new URL(String(value || '')).hostname;
  } catch {
    return String(fallback || '').trim();
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
// WHY: Uses a serialized promise chain instead of a shared timestamp.
// A shared timestamp has a race condition: all concurrent queries read the same
// value, compute the same sleep, and wake simultaneously — bursting SearXNG.
// The promise chain ensures each query waits for the previous one's pacing to
// complete before starting its own, regardless of concurrency.
let _searxngPaceChain = Promise.resolve();
const SEARXNG_MIN_QUERY_INTERVAL_MS = 2_000;

function resolveSearxngMinQueryIntervalMs(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return SEARXNG_MIN_QUERY_INTERVAL_MS;
  }
  return parsed;
}

function acquireSearxngPaceSlot(minIntervalMs) {
  if (minIntervalMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    _searxngPaceChain = _searxngPaceChain.then(async () => {
      const jitterMs = Math.floor(Math.random() * minIntervalMs * 0.5);
      const delayMs = minIntervalMs + jitterMs;
      await new Promise((r) => setTimeout(r, delayMs));
      resolve();
    });
  });
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
  // WHY: Serialized pacing via promise chain. Each query waits for the previous
  // one to finish its delay before starting. Prevents concurrent queries from
  // bursting SearXNG simultaneously (the old timestamp-based approach had a race
  // condition where all concurrent queries read the same timestamp and woke together).
  const minIntervalMs = resolveSearxngMinQueryIntervalMs(minQueryIntervalMs);
  await acquireSearxngPaceSlot(minIntervalMs);
  const url = new URL('/search', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  url.searchParams.set('safesearch', '0');
  const normalizedEngines = String(engines || '').trim();
  if (normalizedEngines) {
    url.searchParams.set('engines', toSearxngEngines(normalizedEngines));
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
    return (payload.results || []).slice(0, Math.max(1, Number(limit || 10))).map((item) => {
      const rawEngine = item.engine || (Array.isArray(item.engines) && item.engines[0]) || String(provider || 'searxng').trim() || 'searxng';
      return {
        url: item.url,
        title: item.title || '',
        snippet: item.content || item.snippet || '',
        provider: fromSearxngEngine(rawEngine),
        engines: Array.isArray(item.engines) ? item.engines.map(fromSearxngEngine) : [],
        query,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function attemptSearch({ searxBase, engines, query, limit, config, logger, requestThrottler }) {
  const maxRetries = Math.max(0, Number(config.searchMaxRetries ?? 0));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rows = await searchSearxng({
        baseUrl: searxBase,
        query,
        limit,
        timeoutMs: config.searxngTimeoutMs,
        minQueryIntervalMs: config.searxngMinQueryIntervalMs,
        engines,
        provider: engines,
        logger,
        requestThrottler
      });
      const cleaned = filterGarbageEngineResults(rows, query);
      if (cleaned.length < rows.length) {
        logger?.warn?.('search_engine_garbage_filtered', {
          query,
          engines,
          original_count: rows.length,
          filtered_count: cleaned.length,
          dropped: rows.length - cleaned.length,
        });
      }
      const deduped = dedupeResults(cleaned);
      if (deduped.length > 0 || attempt === maxRetries) return deduped;
      logger?.info?.('searxng_retry', { query, engines, attempt: attempt + 1, maxRetries, reason: 'zero_results' });
    } catch (error) {
      if (attempt === maxRetries) {
        logger?.warn?.('search_provider_failed', {
          provider: engines,
          query,
          message: error.message
        });
        return [];
      }
      logger?.info?.('searxng_retry', { query, engines, attempt: attempt + 1, maxRetries, reason: error.message });
    }
  }
  return [];
}

// WHY: Parses the googleSearchProxyUrlsJson setting into a string array.
function parseProxyUrlList(jsonStr) {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string' && u.trim()) : [];
  } catch { return []; }
}

// WHY: Splits engine list into google (Crawlee) vs SearXNG-routed engines.
function splitEnginesByTransport(engineList) {
  const google = engineList.filter(e => e === 'google');
  const searxng = engineList.filter(e => e !== 'google');
  return { google, searxng };
}

// WHY: Attempts a Google search via fetch or Crawlee browser (based on screenshotsEnabled).
async function attemptGoogleCrawlee({ query, limit, config, logger, requestThrottler, _searchGoogleFn, screenshotSink }) {
  try {
    const searchFn = _searchGoogleFn || (await import('./searchGoogle.js')).searchGoogle;
    const result = await searchFn({
      query,
      limit,
      timeoutMs: config.googleSearchTimeoutMs,
      proxyUrls: parseProxyUrlList(config.googleSearchProxyUrlsJson),
      minQueryIntervalMs: config.googleSearchMinQueryIntervalMs,
      maxRetries: config.searchMaxRetries ?? config.googleSearchMaxRetries,
      screenshotsEnabled: config.googleSearchScreenshotsEnabled,
      logger,
      requestThrottler,
    });
    const googleResults = result?.results || [];
    if (googleResults.length === 0) {
      logger?.warn?.('google_crawlee_zero_results', { query, has_screenshot: Boolean(result?.screenshot) });
    }
    if (result?.proxyKB !== undefined) {
      logger?.info?.('google_search_proxy_bandwidth', {
        query, proxyKB: result.proxyKB,
        mode: config.googleSearchScreenshotsEnabled ? 'browser' : 'fetch',
      });
    }
    // WHY: Screenshot buffer is a side-channel — pass to sink for persistence
    // without changing the result array contract.
    if (result?.screenshot && typeof screenshotSink === 'function') {
      await screenshotSink({ ...result.screenshot, query }).catch(() => {});
    }
    return googleResults;
  } catch (error) {
    logger?.warn?.('google_crawlee_search_failed', { query, message: error.message, stack: String(error.stack || '').slice(0, 300) });
    return [];
  }
}

// WHY: Serper.dev API — real Google results as structured JSON.
// No browser, no proxy, no CAPTCHA. Used exclusively when enabled.
async function attemptSerperSearch({ query, limit, config, logger, requestThrottler, _searchSerperFn }) {
  try {
    const searchFn = _searchSerperFn || (await import('./searchSerper.js')).searchSerper;
    const result = await searchFn({
      query,
      apiKey: config.serperApiKey,
      limit: config.serperResultCount || limit,
      logger,
      requestThrottler,
    });
    const serperResults = result?.results || [];
    if (serperResults.length === 0) {
      logger?.warn?.('serper_zero_results', { query });
    }
    logger?.info?.('serper_search_bandwidth', { query, proxyKB: 0, mode: 'api' });
    return serperResults;
  } catch (error) {
    logger?.warn?.('serper_search_failed', { query, message: error.message });
    return [];
  }
}

// WHY: Dispatches a mixed engine list — google goes through Crawlee,
// everything else through SearXNG. Results are merged and deduped.
async function dispatchEngines({ engineList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, screenshotSink }) {
  const { google, searxng } = splitEnginesByTransport(engineList);
  const promises = [];

  if (google.length > 0) {
    promises.push(attemptGoogleCrawlee({ query, limit, config, logger, requestThrottler, _searchGoogleFn, screenshotSink }));
  }

  if (searxng.length > 0 && searxBase) {
    promises.push(attemptSearch({ searxBase, engines: searxng.join(','), query, limit, config, logger, requestThrottler }));
  }

  const resultSets = await Promise.all(promises);
  return dedupeResults(resultSets.flat());
}

export async function runSearchProviders({
  config,
  query,
  limit = 10,
  logger,
  requestThrottler,
  _searchGoogleFn,
  _searchSerperFn,
  screenshotSink,
}) {
  // WHY: Serper mode is exclusive — when enabled, skip all Crawlee/SearXNG paths.
  const serperActive = Boolean(config.serperApiKey);
  if (serperActive) {
    const results = await attemptSerperSearch({ query, limit, config, logger, requestThrottler, _searchSerperFn });
    return { results: dedupeResults(results), usedFallback: false, provider: 'serper' };
  }

  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  if (!engines) return { results: [], usedFallback: false };

  const engineList = engines.split(',');
  const { google, searxng } = splitEnginesByTransport(engineList);
  const searxBase = searxngBaseUrl(config);

  // Need at least one viable path: google engines OR (searxng engines + searxng base)
  const hasGooglePath = google.length > 0;
  const hasSearxngPath = searxng.length > 0 && Boolean(searxBase);
  if (!hasGooglePath && !hasSearxngPath) return { results: [], usedFallback: false };

  // Primary attempt
  const primaryResults = await dispatchEngines({ engineList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, screenshotSink });
  if (primaryResults.length > 0) return { results: primaryResults, usedFallback: false };

  // Fallback attempt — only if primary returned nothing usable
  const fallbackEngines = normalizeSearchEngines(config.searchEnginesFallback);
  if (!fallbackEngines) return { results: [], usedFallback: false };

  logger?.info?.('search_fallback_triggered', {
    query,
    primary_engines: engines,
    fallback_engines: fallbackEngines,
  });

  const fallbackList = fallbackEngines.split(',');
  const fallbackResults = await dispatchEngines({ engineList: fallbackList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, screenshotSink });
  return { results: fallbackResults, usedFallback: fallbackResults.length > 0 };
}

export function searchEngineAvailability(config) {
  const serperReady = Boolean(config.serperApiKey);

  // Support both new searchEngines and legacy searchProvider
  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  const engineList = engines ? engines.split(',') : [];
  const fallbackEngines = normalizeSearchEngines(config.searchEnginesFallback);
  const fallbackEngineList = fallbackEngines ? fallbackEngines.split(',') : [];
  const searxngReady = Boolean(searxngBaseUrl(config));
  const { google, searxng } = splitEnginesByTransport(engineList);

  const googleReady = google.length > 0;
  const searxngEnginesReady = searxngReady && searxng.length > 0;
  // WHY: Serper OR Google OR SearXNG = internet ready.
  const internetReady = serperReady || googleReady || searxngEnginesReady;
  const activeProviders = serperReady
    ? ['serper']
    : [
        ...(googleReady ? google : []),
        ...(searxngEnginesReady ? searxng : []),
      ];

  return {
    provider: serperReady ? 'serper' : (engines || 'none'),
    engines: serperReady ? ['serper'] : engineList,
    serper_ready: serperReady,
    bing_ready: searxngReady && engineList.includes('bing'),
    google_ready: serperReady || googleReady,
    google_search_ready: serperReady || googleReady,
    searxng_ready: searxngReady,
    active_providers: activeProviders,
    fallback_engines: serperReady ? [] : fallbackEngineList,
    fallback_ready: serperReady ? false : ((searxngReady && fallbackEngineList.some(e => e !== 'google')) || fallbackEngineList.includes('google')),
    fallback_reason: null,
    internet_ready: internetReady,
  };
}

// WHY: Backward compat alias — downstream imports may still use old name
export const searchProviderAvailability = searchEngineAvailability;
