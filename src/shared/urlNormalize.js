// WHY: Minimal URL canonicalization for consistent dedup keys.
// Only normalizations that affect page identity: hash, param order, trailing slash, HTTPS.
// No www-stripping, no locale-stripping, no tracking-param-stripping — Google/Serper
// returns clean canonical URLs that don't need aggressive normalization.

export function pathSignature(pathname = '') {
  const normalized = String(pathname || '').replace(/\/+/g, '/');
  const parts = normalized.split('/').filter(Boolean).map((segment) => {
    if (/^\d+$/.test(segment)) return ':num';
    if (/^[0-9a-f]{8,}$/i.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment)) return ':id';
    return segment.toLowerCase();
  });
  return parts.length ? `/${parts.slice(0, 6).join('/')}` : '/';
}

export function canonicalizeUrl(rawUrl) {
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
