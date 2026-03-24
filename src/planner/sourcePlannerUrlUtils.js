export function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

export { isObject } from '../shared/primitives.js';

export function getHost(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return '';
  }
}

export function canonicalizeQueueUrl(parsedUrl) {
  const normalized = new URL(parsedUrl.toString());
  // Fragments are client-side only and should not create distinct fetch jobs.
  normalized.hash = '';
  return normalized.toString();
}

export function hostInSet(host, hostSet) {
  if (hostSet.has(host)) {
    return true;
  }
  for (const candidate of hostSet) {
    if (host.endsWith(`.${candidate}`)) {
      return true;
    }
  }
  return false;
}

export function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugIdentityTokens(value = '') {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function countTokenHits(text, tokens) {
  const haystack = String(text || '').toLowerCase();
  let hits = 0;
  for (const token of tokens || []) {
    const norm = String(token || '').toLowerCase().trim();
    if (!norm) {
      continue;
    }
    if (haystack.includes(norm)) {
      hits += 1;
    }
  }
  return hits;
}

export function countQueueHost(queue, host) {
  let count = 0;
  for (const row of queue || []) {
    if (row.host === host) {
      count += 1;
    }
  }
  return count;
}

export function urlPath(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeSourcePath(url) {
  try {
    const parsed = new URL(url);
    return normalizeComparablePath(parsed.pathname || '/');
  } catch {
    return '/';
  }
}

export function normalizeComparablePath(pathname = '/') {
  const rawPath = String(pathname || '/')
    .toLowerCase()
    .replace(/\/+/g, '/');
  if (!rawPath || rawPath === '/') {
    return '/';
  }
  return rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
}

export const CATEGORY_PRODUCT_PATH_RE = /\/(?:gaming-)?(?:mice|mouse|keyboards?|headsets?|monitors?)\//;

export function extractCategoryProductSlug(pathname = '') {
  const match = String(pathname || '').toLowerCase().match(
    /^\/(?:gaming-)?(?:mice|mouse|keyboards?|headsets?|monitors?)\/([^/]+)/
  );
  return String(match?.[1] || '').trim();
}

export function extractManufacturerProductishSlug(pathname = '') {
  const normalizedPath = String(pathname || '').toLowerCase();
  const matchers = [
    /^\/(?:gaming-)?(?:mice|mouse|keyboards?|headsets?|monitors?)\/([^/?#]+)/,
    /^\/product\/([^/?#]+)/,
    /^\/products\/([^/?#]+)$/,
    /^\/products\/[^/]+\/([^/?#]+)$/,
    /\/variant\/products\/([^/?#]+)/,
    /\/products\/([^/?#]+)$/
  ];
  for (const matcher of matchers) {
    const match = normalizedPath.match(matcher);
    const token = String(match?.[1] || '').trim();
    if (token) {
      return token;
    }
  }
  return '';
}

export const BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS = new Set(['base']);

export function isSitemapLikePath(pathname, search = '') {
  const token = `${String(pathname || '')} ${String(search || '')}`.toLowerCase();
  return token.includes('sitemap');
}

export function isNonProductSitemapPointer(parsed) {
  const haystack = [
    normalizeHost(parsed?.hostname || ''),
    String(parsed?.pathname || ''),
    String(parsed?.search || '')
  ].join(' ').toLowerCase();
  if (!haystack.trim()) {
    return false;
  }
  return [
    'image',
    'images',
    'video',
    'videos',
    'news',
    'blog',
    'blogs',
    'press',
    'media'
  ].some((token) => haystack.includes(token));
}

export function stripLocalePrefix(pathname) {
  const raw = String(pathname || '').toLowerCase();
  const match = raw.match(/^\/([a-z]{2}|[a-z]{2,5}-[a-z]{2})\/(.+)$/);
  if (!match) {
    return {
      pathname: raw,
      hadLocalePrefix: false
    };
  }
  return {
    pathname: `/${match[2]}`,
    hadLocalePrefix: true
  };
}

export function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractFirstHttpUrlToken(value = '') {
  const decoded = decodeXmlEntities(value);
  const match = decoded.match(/https?:\/\/[^\s<>"']+/i);
  return String(match?.[0] || '').trim();
}

// WHY: Shared triage metadata lookup — canonical URL first, then normalized,
// then raw fallback. Used by both SourcePlanner and Domain Classifier.
export function lookupTriageMeta(url, triageMetaMap) {
  if (!triageMetaMap || triageMetaMap.size === 0) return null;
  try {
    const parsed = new URL(url);
    const canonical = canonicalizeQueueUrl(parsed);
    if (triageMetaMap.has(canonical)) return triageMetaMap.get(canonical);
    const normalized = parsed.toString();
    if (triageMetaMap.has(normalized)) return triageMetaMap.get(normalized);
  } catch {
    // Fall through to raw lookup
  }
  if (triageMetaMap.has(url)) return triageMetaMap.get(url);
  return null;
}
