// WHY: Serper.dev API client for Google SERP results.
// Returns real Google organic results as structured JSON.
// No browser, no proxy, no CAPTCHA. ~3KB per response.

import { createPacer } from './createPacer.js';

const SERPER_URL = 'https://google.serper.dev/search';

// ---------------------------------------------------------------------------
// Module-level pacing — injectable via _pacer param
// ---------------------------------------------------------------------------

const _defaultPacer = createPacer({ minIntervalMs: 500 });

export function resetSerperPacingForTests() {
  _defaultPacer.resetForTests();
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
 * @param {number} [options.limit=10] - Results per query (1-10, Serper hard cap)
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
  limit = 10,
  timeoutMs,
  minQueryIntervalMs,
  maxRetries,
  gl = 'us',
  hl = 'en',
  autocorrect = true,
  logger,
  requestThrottler,
  _fetchFn,
  _pacer,
  // WHY: Registry settings flow in via the caller's settings bag.
  // Defaults match settingsRegistry SSOT for standalone usage.
  serperSearchMinIntervalMs = 500,
  serperSearchTimeoutMs = 10_000,
  serperSearchMaxRetries = 3,
} = {}) {
  const EMPTY = { results: [], proxyKB: 0 };

  if (!query || !String(query).trim()) return EMPTY;
  if (!apiKey) {
    logger?.warn?.('serper_missing_api_key', { query });
    return EMPTY;
  }

  const q = String(query).trim();
  // WHY: Serper returns max 10 organic results regardless of `num` (confirmed via live API test).
  const cap = Math.max(1, Math.min(10, Number(limit) || 10));
  const fetchFn = _fetchFn || globalThis.fetch;

  // WHY: Resolve explicit param → registry setting. Caller supplies both tiers.
  const effectiveMinInterval = minQueryIntervalMs ?? serperSearchMinIntervalMs;
  const effectiveRetryBase = 1000;
  const effectiveTimeout = timeoutMs ?? serperSearchTimeoutMs;
  const effectiveMaxRetries = maxRetries ?? serperSearchMaxRetries;

  // Pacing — injectable for tests
  const pacer = _pacer || _defaultPacer;
  await pacer.waitForSlot({ interval: effectiveMinInterval });

  if (typeof requestThrottler?.acquire === 'function') {
    await requestThrottler.acquire({ key: 'google.serper.dev', provider: 'serper', query: q });
  }

  const body = JSON.stringify({ q, num: cap, gl, hl, autocorrect });

  let lastError = null;
  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = effectiveRetryBase * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * backoffMs * 0.3);
      await new Promise(r => setTimeout(r, backoffMs + jitter));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(effectiveTimeout) || 10_000));

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
        logger?.warn?.('serper_timeout', { query: q, timeout_ms: effectiveTimeout, attempt });
      } else {
        logger?.warn?.('serper_fetch_error', { query: q, message: err.message, attempt });
      }
    }
  }

  logger?.error?.('serper_all_retries_exhausted', { query: q, max_retries: effectiveMaxRetries, last_error: lastError?.message });
  return EMPTY;
}
