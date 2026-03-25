import { SEARXNG_AVAILABLE_ENGINES } from '../../../../shared/settingsDefaults.js';
import { configInt, configBool, configValue } from '../../../../shared/settingsAccessor.js';
import { searchSearxng, filterGarbageEngineResults } from './searchSearxng.js';

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

async function attemptSearch({ searxBase, engines, query, limit, config, logger, requestThrottler }) {
  const maxRetries = configInt(config, 'searchMaxRetries');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rows = await searchSearxng({
        baseUrl: searxBase,
        query,
        limit,
        timeoutMs: config.searxngSearchTimeoutMs,
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

// WHY: Engine → transport mapping. Unlisted engines default to 'searxng'.
// Adding a new direct-API transport (e.g. brave-api) means adding one entry here
// instead of editing branching logic throughout the file.
const ENGINE_TRANSPORT = {
  'google': 'crawlee',
  'brave': 'brave-api',
};

// WHY: Each transport defines readiness + execution. Adding a new direct-API
// transport means adding one entry here instead of editing dispatch branching.
export const TRANSPORT_REGISTRY = Object.freeze({
  crawlee: {
    ready: () => true,
    execute: (args) => attemptGoogleCrawlee(args),
  },
  searxng: {
    ready: (cfg) => Boolean(searxngBaseUrl(cfg)),
    execute: (args) => attemptSearch(args),
  },
  'brave-api': {
    ready: (cfg) => Boolean(configValue(cfg, 'braveApiKey')),
    execute: (args) => attemptBraveSearch(args),
  },
});

export function groupEnginesByTransport(engineList) {
  const groups = {};
  for (const engine of engineList) {
    const transport = ENGINE_TRANSPORT[engine] || 'searxng';
    (groups[transport] ??= []).push(engine);
  }
  return groups;
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
      postResultsDelayMs: config.googleSearchPostResultsDelayMs,
      screenshotQuality: config.googleSearchScreenshotQuality,
      serpSelectorWaitMs: config.googleSearchSerpSelectorWaitMs,
      scrollDelayMs: config.googleSearchScrollDelayMs,
      jitterFactor: config.searchPacingJitterFactor,
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
      limit: limit,
      timeoutMs: config.serperSearchTimeoutMs,
      minQueryIntervalMs: config.serperSearchMinIntervalMs,
      maxRetries: config.serperSearchMaxRetries,
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

// WHY: Brave Search direct API — uses subscription token, no browser/proxy.
async function attemptBraveSearch({ query, limit, config, logger, _searchBraveFn }) {
  try {
    const searchFn = _searchBraveFn || (await import('./searchBrave.js')).searchBrave;
    const results = await searchFn({
      query,
      apiKey: configValue(config, 'braveApiKey'),
      count: limit,
      timeoutMs: config.braveSearchTimeoutMs,
      braveSearchTimeoutMs: config.braveSearchTimeoutMs,
      braveSearchResultCap: config.braveSearchResultCap,
      logger,
    });
    if (Array.isArray(results) && results.length === 0) {
      logger?.warn?.('brave_search_zero_results', { query });
    }
    return Array.isArray(results) ? results : [];
  } catch (error) {
    logger?.warn?.('brave_search_dispatch_failed', { query, message: error.message });
    return [];
  }
}

// WHY: Dispatches a mixed engine list by transport group.
// Each transport runs in parallel; results are merged and deduped.
// Registry-driven — adding a new transport requires zero edits here.
async function dispatchEngines({ engineList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, _searchBraveFn, screenshotSink }) {
  const groups = groupEnginesByTransport(engineList);
  const bag = { searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, _searchBraveFn, screenshotSink };
  const promises = Object.entries(groups)
    .filter(([key]) => TRANSPORT_REGISTRY[key]?.ready(config))
    .map(([key, engines]) => TRANSPORT_REGISTRY[key].execute({ engines, ...bag }));
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
  _searchBraveFn,
  screenshotSink,
}) {
  // WHY: Serper mode is exclusive — when enabled, skip all Crawlee/SearXNG paths.
  const serperActive = Boolean(configValue(config, 'serperApiKey')) && configBool(config, 'serperEnabled');
  logger?.info?.('search_provider_routing', {
    serperActive,
    hasApiKey: Boolean(configValue(config, 'serperApiKey')),
    serperEnabled: configBool(config, 'serperEnabled'),
    query: String(query || '').slice(0, 60),
  });
  if (serperActive) {
    const results = await attemptSerperSearch({ query, limit, config, logger, requestThrottler, _searchSerperFn });
    logger?.info?.('serper_dispatch_result', { query: String(query || '').slice(0, 60), resultCount: results.length });
    return { results: dedupeResults(results), usedFallback: false, provider: 'serper' };
  }

  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  if (!engines) return { results: [], usedFallback: false };

  const engineList = engines.split(',');
  const groups = groupEnginesByTransport(engineList);
  const searxBase = searxngBaseUrl(config);

  // Need at least one viable path: a ready non-searxng transport OR (searxng engines + searxng base)
  const hasDirectPath = Object.entries(groups).some(
    ([key, engines]) => key !== 'searxng' && engines.length > 0 && TRANSPORT_REGISTRY[key]?.ready(config)
  );
  const hasSearxngPath = (groups.searxng?.length > 0) && Boolean(searxBase);
  if (!hasDirectPath && !hasSearxngPath) return { results: [], usedFallback: false };

  // Primary attempt
  const primaryResults = await dispatchEngines({ engineList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, _searchBraveFn, screenshotSink });
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
  const fallbackResults = await dispatchEngines({ engineList: fallbackList, searxBase, query, limit, config, logger, requestThrottler, _searchGoogleFn, _searchBraveFn, screenshotSink });
  return { results: fallbackResults, usedFallback: fallbackResults.length > 0 };
}

export function searchEngineAvailability(config) {
  const serperReady = Boolean(configValue(config, 'serperApiKey')) && configBool(config, 'serperEnabled');

  // Support both new searchEngines and legacy searchProvider
  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  const engineList = engines ? engines.split(',') : [];
  const fallbackEngines = normalizeSearchEngines(config.searchEnginesFallback);
  const fallbackEngineList = fallbackEngines ? fallbackEngines.split(',') : [];
  const searxngReady = Boolean(searxngBaseUrl(config));
  const groups = groupEnginesByTransport(engineList);

  const googleReady = (groups.crawlee?.length > 0);
  const braveApiReady = Boolean(configValue(config, 'braveApiKey'));
  const searxngEnginesReady = searxngReady && (groups.searxng?.length > 0);
  // WHY: Serper OR any ready direct-API transport OR SearXNG = internet ready.
  const hasDirectPath = Object.entries(groups).some(
    ([key, engines]) => key !== 'searxng' && engines.length > 0 && TRANSPORT_REGISTRY[key]?.ready(config)
  );
  const internetReady = serperReady || hasDirectPath || searxngEnginesReady;
  const activeProviders = serperReady
    ? ['serper']
    : [
        ...Object.entries(groups)
          .filter(([key, engines]) => key !== 'searxng' && engines.length > 0 && TRANSPORT_REGISTRY[key]?.ready(config))
          .flatMap(([, engines]) => engines),
        ...(searxngEnginesReady ? groups.searxng : []),
      ];

  return {
    provider: serperReady ? 'serper' : (engines || 'none'),
    engines: serperReady ? ['serper'] : engineList,
    serper_ready: serperReady,
    bing_ready: searxngReady && engineList.includes('bing'),
    google_ready: serperReady || googleReady,
    google_search_ready: serperReady || googleReady,
    brave_api_ready: braveApiReady,
    searxng_ready: searxngReady,
    active_providers: activeProviders,
    fallback_engines: serperReady ? [] : fallbackEngineList,
    fallback_ready: serperReady ? false : ((searxngReady && fallbackEngineList.some(e => e !== 'google')) || fallbackEngineList.includes('google') || (braveApiReady && fallbackEngineList.includes('brave'))),
    fallback_reason: null,
    internet_ready: internetReady,
  };
}
