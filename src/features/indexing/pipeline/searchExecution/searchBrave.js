// WHY: Brave Search API client. Independent index (not Google wrapper).
// Returns up to 20 results per request natively.
// extra_snippets provides up to 5 bonus text excerpts per result.

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Search via Brave Search API.
 *
 * @param {object} options
 * @param {string} options.query
 * @param {string} options.apiKey - Brave subscription token
 * @param {number} [options.count=20] - Results (1-20)
 * @param {string} [options.searchLang='en']
 * @param {string} [options.country='US']
 * @param {number} [options.timeoutMs=8000]
 * @param {boolean} [options.extraSnippets=true]
 * @param {object} [options.logger]
 * @param {Function} [options._fetchFn] - DI seam for testing
 * @returns {Promise<Array>}
 */
export async function searchBrave({
  query,
  apiKey,
  count,
  searchLang = 'en',
  country = 'US',
  timeoutMs,
  extraSnippets = true,
  logger,
  _fetchFn,
  // WHY: Registry settings flow in via the caller's settings bag.
  braveSearchTimeoutMs,
  braveSearchResultCap,
} = {}) {
  if (!query || !String(query).trim() || !apiKey) return [];

  // WHY: Resolve registry settings → explicit param → fallback constant.
  const effectiveTimeout = timeoutMs ?? braveSearchTimeoutMs ?? 8_000;
  const effectiveCount = count ?? braveSearchResultCap ?? 20;

  const fetchFn = _fetchFn || globalThis.fetch;
  const url = new URL(BRAVE_URL);
  url.searchParams.set('q', String(query).trim());
  url.searchParams.set('count', String(Math.min(20, Math.max(1, effectiveCount))));
  url.searchParams.set('search_lang', searchLang);
  url.searchParams.set('country', country);
  url.searchParams.set('safesearch', 'off');
  url.searchParams.set('text_decorations', 'false');
  url.searchParams.set('result_filter', 'web');
  if (extraSnippets) url.searchParams.set('extra_snippets', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, effectiveTimeout));

  try {
    const response = await fetchFn(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger?.warn?.('brave_search_http_error', { query, status: response.status });
      return [];
    }

    const payload = await response.json();
    return (payload?.web?.results || []).map(item => ({
      url: item.url,
      title: item.title || '',
      snippet: item.description || '',
      provider: 'brave-api',
      query: String(query).trim(),
      extraSnippets: item.extra_snippets || [],
      age: item.age || '',
      pageAge: item.page_age || '',
      hostname: item.meta_url?.hostname || '',
      language: item.language || '',
    }));
  } catch (err) {
    logger?.warn?.('brave_search_error', { query, message: err.message });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
