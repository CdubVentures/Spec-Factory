/**
 * URL health check via HTTP HEAD.
 *
 * Used by the publisher candidate gate to verify evidence_refs[].url before
 * accepting them into field_candidate_evidence. 2xx → accepted, 4xx/5xx →
 * rejected, network error / timeout / invalid URL → unknown (http_status 0),
 * treated as accepted so a flaky network doesn't nuke legitimate sources.
 */

const DEFAULT_TIMEOUT_MS = 5000;

function isValidUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  try { new URL(raw); return true; } catch { return false; }
}

async function checkOne(url, timeoutMs) {
  async function fetchWith(method) {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res?.status ?? 0;
  }

  // WHY: Node/undici HEAD fails against some CDNs (observed on Corsair.com:
  // HEAD throws "fetch failed" while GET returns 200). Any HEAD failure —
  // whether 405 or a thrown error — falls back to GET. Only when GET also
  // fails do we return http_status: 0 (network error / unknown).
  let headError = null;
  try {
    const status = await fetchWith('HEAD');
    if (status !== 405) {
      return { http_status: status, verified_at: new Date().toISOString() };
    }
  } catch (err) {
    headError = err;
  }

  try {
    const status = await fetchWith('GET');
    return { http_status: status, verified_at: new Date().toISOString() };
  } catch (err) {
    const finalErr = err || headError;
    const errorKey = finalErr?.name === 'AbortError' || finalErr?.name === 'TimeoutError' ? 'timeout' : (finalErr?.message || 'fetch_failed');
    return { http_status: 0, verified_at: new Date().toISOString(), error: errorKey };
  }
}

/**
 * @param {Array<string|null|undefined>} urls
 * @param {{ timeoutMs?: number, cache?: Map<string, object> }} [opts]
 * @returns {Promise<Map<string, { http_status: number, verified_at: string|null, error?: string }>>}
 */
export async function batchHeadCheck(urls, { timeoutMs = DEFAULT_TIMEOUT_MS, cache = null } = {}) {
  const result = new Map();
  if (!Array.isArray(urls) || urls.length === 0) return result;

  const unique = new Set();
  for (const raw of urls) {
    if (raw == null || raw === '') continue;
    unique.add(String(raw));
  }

  const toFetch = [];
  for (const url of unique) {
    if (!isValidUrl(url)) {
      const entry = { http_status: 0, verified_at: null, error: 'invalid_url' };
      result.set(url, entry);
      continue;
    }
    if (cache?.has(url)) {
      result.set(url, cache.get(url));
      continue;
    }
    toFetch.push(url);
  }

  await Promise.all(toFetch.map(async (url) => {
    const entry = await checkOne(url, timeoutMs);
    result.set(url, entry);
    cache?.set(url, entry);
  }));

  return result;
}
