// WHY: Serper.dev API client for Google SERP results.
// Returns real Google organic results as structured JSON.
// No browser, no proxy, no CAPTCHA. ~3KB per response.

const SERPER_URL = 'https://google.serper.dev/search';
const DEFAULT_MIN_INTERVAL_MS = 500;
const RETRY_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Module-level pacing
// ---------------------------------------------------------------------------

let _lastSerperQueryMs = 0;

export function resetSerperPacingForTests() {
  _lastSerperQueryMs = 0;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Search Google via Serper.dev API.
 *
 * @param {object} options
 * @param {string} options.query
 * @param {string} options.apiKey - Serper API key
 * @param {number} [options.limit=20] - Results per query (1-100)
 * @param {number} [options.timeoutMs=10000]
 * @param {number} [options.minQueryIntervalMs=500]
 * @param {number} [options.maxRetries=3]
 * @param {string} [options.gl='us'] - Country code
 * @param {string} [options.hl='en'] - Language
 * @param {boolean} [options.autocorrect=true]
 * @param {object} [options.logger]
 * @param {object} [options.requestThrottler]
 * @param {Function} [options._fetchFn] - DI seam for testing
 * @returns {Promise<{ results: Array, proxyKB: number }>}
 */
export async function searchSerper({
  query,
  apiKey,
  limit = 20,
  timeoutMs = 10_000,
  minQueryIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  maxRetries = 3,
  gl = 'us',
  hl = 'en',
  autocorrect = true,
  logger,
  requestThrottler,
  _fetchFn,
} = {}) {
  const EMPTY = { results: [], proxyKB: 0 };

  if (!query || !String(query).trim()) return EMPTY;
  if (!apiKey) {
    logger?.warn?.('serper_missing_api_key', { query });
    return EMPTY;
  }

  const q = String(query).trim();
  const cap = Math.max(1, Math.min(100, Number(limit) || 20));
  const fetchFn = _fetchFn || globalThis.fetch;

  // Pacing
  const interval = Math.max(0, minQueryIntervalMs);
  if (interval > 0) {
    const now = Date.now();
    const elapsed = now - _lastSerperQueryMs;
    if (elapsed < interval) {
      await new Promise(r => setTimeout(r, interval - elapsed));
    }
  }
  _lastSerperQueryMs = Date.now();

  if (typeof requestThrottler?.acquire === 'function') {
    await requestThrottler.acquire({ key: 'google.serper.dev', provider: 'serper', query: q });
  }

  const body = JSON.stringify({ q, num: cap, gl, hl, autocorrect });

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * backoffMs * 0.3);
      await new Promise(r => setTimeout(r, backoffMs + jitter));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));

    try {
      const response = await fetchFn(SERPER_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        logger?.error?.('serper_auth_failed', { query: q, status: 401 });
        return EMPTY;
      }
      if (response.status === 402) {
        logger?.error?.('serper_credits_exhausted', { query: q, status: 402 });
        return EMPTY;
      }
      if (response.status === 400) {
        logger?.error?.('serper_bad_request', { query: q, status: 400 });
        return EMPTY;
      }

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Serper HTTP ${response.status}`);
        logger?.warn?.('serper_retryable_error', { query: q, status: response.status, attempt });
        continue;
      }

      if (!response.ok) {
        logger?.warn?.('serper_unexpected_status', { query: q, status: response.status });
        return EMPTY;
      }

      const payload = await response.json();

      // WHY: Serper uses `link`, our pipeline uses `url`.
      const organic = (payload.organic || []).slice(0, cap).map((item) => ({
        url: item.link || '',
        title: item.title || '',
        snippet: item.snippet || '',
        position: item.position || 0,
        provider: 'serper',
        query: q,
      }));

      logger?.info?.('serper_search_complete', {
        query: q, result_count: organic.length,
      });

      return { results: organic, proxyKB: 0 };

    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (err.name === 'AbortError') {
        logger?.warn?.('serper_timeout', { query: q, timeout_ms: timeoutMs, attempt });
      } else {
        logger?.warn?.('serper_fetch_error', { query: q, message: err.message, attempt });
      }
    }
  }

  logger?.error?.('serper_all_retries_exhausted', { query: q, max_retries: maxRetries, last_error: lastError?.message });
  return EMPTY;
}
