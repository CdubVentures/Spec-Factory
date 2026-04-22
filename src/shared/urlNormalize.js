// WHY: Minimal URL canonicalization for consistent dedup keys.
// Default: hash strip, param order, trailing slash, HTTPS — preserves all params
// so DB / audit paths keep full URL identity (Google/Serper canonical URLs).
// Opt-in { stripTracking: true }: also removes known ad/analytics tracking params
// so the fetch layer can dedup SERP results whose only difference is tracking noise
// (e.g. Google Shopping's srsltid redirects produce 6× variants of the same page).

// Exact-match tracking params (ad click IDs, analytics, campaign refs).
const TRACKING_PARAMS_EXACT = new Set([
  'srsltid',
  'gclid', 'fbclid', 'yclid', 'msclkid', 'dclid',
  'mc_cid', 'mc_eid',
  '_ga', '_gl',
  'ref_src',
]);

// Prefix-match tracking params (whole UTM family).
const TRACKING_PARAM_PREFIXES = ['utm_'];

function isTrackingParam(key) {
  if (TRACKING_PARAMS_EXACT.has(key)) return true;
  return TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function pathSignature(pathname = '') {
  const normalized = String(pathname || '').replace(/\/+/g, '/');
  const parts = normalized.split('/').filter(Boolean).map((segment) => {
    if (/^\d+$/.test(segment)) return ':num';
    if (/^[0-9a-f]{8,}$/i.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment)) return ':id';
    return segment.toLowerCase();
  });
  return parts.length ? `/${parts.slice(0, 6).join('/')}` : '/';
}

export function canonicalizeUrl(rawUrl, { stripTracking = false } = {}) {
  const input = String(rawUrl || '').trim();
  if (!input) {
    return { original_url: '', canonical_url: '', domain: '', path_sig: '' };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return { original_url: input, canonical_url: '', domain: '', path_sig: '' };
  }

  url.hash = '';
  url.protocol = 'https:';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  if (stripTracking) {
    const keysToRemove = [];
    for (const key of url.searchParams.keys()) {
      if (isTrackingParam(key)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) url.searchParams.delete(key);
  }

  url.searchParams.sort();

  const canonical = url.toString();
  return {
    original_url: input,
    canonical_url: canonical,
    domain: url.hostname.toLowerCase(),
    path_sig: pathSignature(url.pathname),
    query: url.search ? url.search.slice(1) : '',
  };
}
