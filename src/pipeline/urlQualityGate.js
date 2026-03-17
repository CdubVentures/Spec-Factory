/**
 * Pre-fetch URL quality gate.
 * Validates URLs before they enter the fetch queue to prevent wasted slots.
 */

import { isLowValueSubdomain } from '../utils/common.js';

/**
 * Hosts that never yield useful spec data.
 * Social/UGC sites that aggressively block bots or contain only discussion, not specs.
 */
const LOW_VALUE_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'facebook.com',
  'www.facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'www.instagram.com',
  'tiktok.com',
  'www.tiktok.com',
  'youtube.com',
  'www.youtube.com',
  'pinterest.com',
  'www.pinterest.com',
  'quora.com',
  'www.quora.com',
  'linkedin.com',
  'www.linkedin.com',
  // Retailers — shopping pages, not spec sources; aggressive bot blocking
  'bestbuy.com',
  'www.bestbuy.com',
  'amazon.com',
  'www.amazon.com',
  'walmart.com',
  'www.walmart.com',
  'target.com',
  'www.target.com',
  'ebay.com',
  'www.ebay.com',
  // Irrelevant domains that pollute search results
  'homebuiltairplanes.com',
  'www.homebuiltairplanes.com',
  'dslreports.com',
  'www.dslreports.com',
  'manualzz.com',
  'www.manualzz.com',
  // CDN / media hosts (no product specs)
  'm.media-amazon.com',
]);

// WHY: Subdomain prefix list is shared via isLowValueSubdomain() from utils/common.js

export function isLowValueHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (LOW_VALUE_HOSTS.has(h)) return true;
  // Non-routable TLDs (test URL leaks)
  if (h.endsWith('.local') || h.endsWith('.test') || h.endsWith('.invalid') || h.endsWith('.localhost')) return true;
  // Check root domain (e.g. old.reddit.com -> reddit.com)
  const parts = h.split('.');
  if (parts.length > 2) {
    const root = parts.slice(-2).join('.');
    if (LOW_VALUE_HOSTS.has(root)) return true;
    if (isLowValueSubdomain(h)) return true;
  }
  return false;
}

export function validateFetchUrl(url, {
  deadUrls = null,
  brand = '',
  model = '',
} = {}) {
  const raw = String(url || '').trim();
  if (!raw) {
    return { valid: false, reason: 'empty_url', priority: 'skip' };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { valid: false, reason: 'invalid_url', priority: 'skip' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'invalid_protocol', priority: 'skip' };
  }

  if (deadUrls instanceof Set && deadUrls.has(raw)) {
    return { valid: false, reason: 'dead_url', priority: 'skip' };
  }

  if (isLowValueHost(parsed.hostname)) {
    return { valid: false, reason: 'low_value_host', priority: 'skip' };
  }

  // Reject third-party on-site search pages (they return search results, not product specs)
  if (isThirdPartySearchPage(parsed)) {
    return { valid: false, reason: 'onsite_search_page', priority: 'skip' };
  }

  const priority = classifyUrlPriority(parsed, brand, model);
  return { valid: true, reason: 'ok', priority };
}

/**
 * Detect third-party on-site search pages.
 * These are search result listing pages (e.g. techpowerup.com/search/?q=...) that
 * never contain product specs — they're just search result lists.
 * We keep manufacturer search pages (e.g. razer.com/search) because those may
 * redirect to product pages.
 */
const KNOWN_SEARCH_404_HOSTS = new Set([
  'techpowerup.com', 'www.techpowerup.com',
  'eloshapes.com', 'www.eloshapes.com',
  'rtings.com', 'www.rtings.com',
  'bestbuy.com', 'www.bestbuy.com',
  'newegg.com', 'www.newegg.com',
]);

function isThirdPartySearchPage(parsed) {
  const path = parsed.pathname.toLowerCase();
  const hasSearchPath = path.startsWith('/search') || path.includes('/search/');
  const hasSearchQuery = parsed.search.includes('q=');
  if (!hasSearchPath && !hasSearchQuery) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return KNOWN_SEARCH_404_HOSTS.has(host) || KNOWN_SEARCH_404_HOSTS.has(parsed.hostname.toLowerCase());
}

function classifyUrlPriority(parsed, brand, model) {
  const path = parsed.pathname.toLowerCase();
  const brandSlug = slugify(brand);
  const modelSlug = slugify(model);

  // Homepage or very short path = low priority
  if (path === '/' || path === '') {
    return 'low';
  }

  // Category listings without product slug = low priority
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1 && !pathContainsSlug(path, modelSlug)) {
    return 'low';
  }

  // Path contains model slug = high priority
  if (modelSlug && pathContainsSlug(path, modelSlug)) {
    return 'high';
  }

  // Path contains brand slug = medium priority
  if (brandSlug && pathContainsSlug(path, brandSlug)) {
    return 'medium';
  }

  return 'medium';
}

function slugify(text) {
  return String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pathContainsSlug(path, slug) {
  if (!slug) return false;
  // Check if any key words from the slug appear in the path
  const words = slug.split('-').filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  const lowerPath = path.toLowerCase();
  return words.filter((w) => lowerPath.includes(w)).length >= Math.ceil(words.length * 0.5);
}
