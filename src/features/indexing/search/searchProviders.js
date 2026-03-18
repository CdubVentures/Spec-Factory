import { SEARXNG_AVAILABLE_ENGINES } from '../../../shared/settingsDefaults.js';

// WHY: Legacy migration map for old searchProvider enum values → new searchEngines CSV.
const LEGACY_MIGRATION_MAP = {
  dual: 'bing,google',
  google: 'google',
  bing: 'bing',
  searxng: 'bing,startpage,duckduckgo',
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
let _lastSearxngQueryMs = 0;
const SEARXNG_MIN_QUERY_INTERVAL_MS = 2_000;

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
  // WHY: Fixed-interval queries are trivially detected as bot traffic by upstream
  // engines (Bing, Startpage). Adding random jitter (0–50% of base interval)
  // makes the timing pattern look more human and reduces CAPTCHA triggers.
  const minIntervalMs = resolveSearxngMinQueryIntervalMs(minQueryIntervalMs);
  const jitterMs = Math.floor(Math.random() * minIntervalMs * 0.5);
  const targetIntervalMs = minIntervalMs + jitterMs;
  const now = Date.now();
  const elapsed = now - _lastSearxngQueryMs;
  if (elapsed < targetIntervalMs) {
    await new Promise((r) => setTimeout(r, targetIntervalMs - elapsed));
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
      provider: item.engine || (Array.isArray(item.engines) && item.engines[0]) || String(provider || 'searxng').trim() || 'searxng',
      engines: Array.isArray(item.engines) ? item.engines : [],
      query
    }));
  } finally {
    clearTimeout(timeout);
  }
}

async function attemptSearch({ searxBase, engines, query, limit, config, logger, requestThrottler }) {
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
    return dedupeResults(cleaned);
  } catch (error) {
    logger?.warn?.('search_provider_failed', {
      provider: engines,
      query,
      message: error.message
    });
    return [];
  }
}

export async function runSearchProviders({
  config,
  query,
  limit = 10,
  logger,
  requestThrottler
}) {
  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  if (!engines) return [];

  const searxBase = searxngBaseUrl(config);
  if (!searxBase) return [];

  // Primary attempt
  const primaryResults = await attemptSearch({ searxBase, engines, query, limit, config, logger, requestThrottler });
  if (primaryResults.length > 0) return primaryResults;

  // Fallback attempt — only if primary returned nothing usable
  const fallbackEngines = normalizeSearchEngines(config.searchEnginesFallback);
  if (!fallbackEngines) return [];

  logger?.info?.('search_fallback_triggered', {
    query,
    primary_engines: engines,
    fallback_engines: fallbackEngines,
  });

  return attemptSearch({ searxBase, engines: fallbackEngines, query, limit, config, logger, requestThrottler });
}

export function searchEngineAvailability(config) {
  // Support both new searchEngines and legacy searchProvider
  const engines = normalizeSearchEngines(config.searchEngines ?? config.searchProvider);
  const engineList = engines ? engines.split(',') : [];
  const fallbackEngines = normalizeSearchEngines(config.searchEnginesFallback);
  const fallbackEngineList = fallbackEngines ? fallbackEngines.split(',') : [];
  const searxngReady = Boolean(searxngBaseUrl(config));

  return {
    // WHY: Keep legacy field names for downstream log compat
    provider: engines || 'none',
    engines: engineList,
    bing_ready: searxngReady && engineList.includes('bing'),
    google_ready: searxngReady && engineList.includes('google'),
    google_search_ready: searxngReady && engineList.includes('google'),
    searxng_ready: searxngReady,
    active_providers: searxngReady ? engineList : [],
    fallback_engines: fallbackEngineList,
    fallback_ready: searxngReady && fallbackEngineList.length > 0,
    fallback_reason: null,
    internet_ready: searxngReady && engineList.length > 0
  };
}

// WHY: Backward compat alias — downstream imports may still use old name
export const searchProviderAvailability = searchEngineAvailability;
