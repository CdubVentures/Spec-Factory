/**
 * Bright Data Web Unlocker API fallback — HTML-only unlock when Playwright fetch is blocked.
 *
 * POSTs the target URL to api.brightdata.com/request with Bearer auth. Bright Data's
 * infrastructure solves anti-bot challenges on its end and returns the rendered HTML.
 *
 * Tradeoffs vs proxy-mode unlockers:
 *   + dead simple: one HTTP call, no Crawlee / Playwright plumbing
 *   + pay-only-for-success ($1.50/1k PAYG)
 *   − no screenshot: API returns HTML only, our plugin stack + CDP screencast do not run
 *
 * Only retries on API-side transient 5xx errors or network faults.
 * Auth errors (401/403) and target-page responses (any status_code) never retry:
 *   Bright Data already did the fetch and reported the result; retrying won't change it.
 */

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1000;

function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

export async function unlockViaApi({
  url,
  apiKey,
  zone,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  _fetch = globalThis.fetch,
  _sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (!url || !apiKey || !zone) {
    return {
      status: 0, html: '', finalUrl: url || '', title: '',
      error: 'missing_required_param', attemptsUsed: 0,
    };
  }

  let lastError = 'unknown';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await _fetch(BRIGHTDATA_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ zone, url, format: 'json' }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Auth / zone errors — never retry, Bright Data will keep rejecting
      if (res.status === 401 || res.status === 403) {
        return {
          status: res.status, html: '', finalUrl: url, title: '',
          error: `brightdata_auth_${res.status}`, attemptsUsed: attempt,
        };
      }

      // Transient server errors — retry
      if (!res.ok) {
        lastError = `brightdata_api_${res.status}`;
        if (attempt < maxRetries) await _sleep(RETRY_BACKOFF_MS);
        continue;
      }

      const json = await res.json();
      const targetStatus = Number(json?.status_code) || 0;
      const body = String(json?.body ?? '');
      const finalUrl = String(json?.url || url);
      const title = extractTitle(body);

      return {
        status: targetStatus,
        html: body,
        finalUrl,
        title,
        error: '',
        attemptsUsed: attempt,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err?.name === 'AbortError'
        ? 'brightdata_timeout'
        : `brightdata_fetch_error:${err?.message || 'unknown'}`;
      if (attempt < maxRetries) await _sleep(RETRY_BACKOFF_MS);
    }
  }

  return {
    status: 0, html: '', finalUrl: url, title: '',
    error: lastError, attemptsUsed: maxRetries,
  };
}
