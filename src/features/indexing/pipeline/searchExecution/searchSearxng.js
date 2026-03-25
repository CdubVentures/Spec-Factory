// WHY: SearXNG search transport. Handles engine name translation, pacing,
// throttling, and garbage result filtering for SearXNG-proxied engines.
// Follows the same standalone-transport pattern as searchGoogle.js / searchSerper.js.

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

// WHY: Bing (and occasionally other engines) serve anti-bot/CAPTCHA pages
// when they detect automated scraping. SearXNG parses whatever links are on
// that page (sidebar ads, footer links, random content) and returns them as
// "results." These garbage results share no query terms in title/url/snippet.
// We detect per-engine: if >50% of an engine's results have zero query-word
// overlap, that engine's batch is poisoned and all its results are dropped.
export function filterGarbageEngineResults(rows, query) {
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

function hostKeyFromUrl(value, fallback = '') {
  try {
    return new URL(String(value || '')).hostname;
  } catch {
    return String(fallback || '').trim();
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

// WHY: Module-level pacing to prevent upstream engine rate-limiting (CAPTCHA/ban).
// SearXNG fans out across upstream engines, so rapid queries trigger bans.
// Uses a serialized promise chain instead of a shared timestamp (createPacer).
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
  timeoutMs,
  minQueryIntervalMs = SEARXNG_MIN_QUERY_INTERVAL_MS,
  engines = '',
  provider = 'searxng',
  logger,
  requestThrottler,
  // WHY: Registry setting flows in via the caller's settings bag.
  searxngSearchTimeoutMs,
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
  // WHY: Resolve registry setting → explicit param → fallback constant.
  const effectiveTimeout = timeoutMs ?? searxngSearchTimeoutMs ?? 8_000;
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
  const timeout = setTimeout(() => controller.abort(), Math.max(100, Number(effectiveTimeout)));

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
