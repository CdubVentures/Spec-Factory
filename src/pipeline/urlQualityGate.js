/**
 * Pre-fetch URL quality gate.
 * Validates URLs before they enter the fetch queue to prevent wasted slots.
 */

import { isLowValueSubdomain } from '../shared/valueNormalizers.js';

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

// WHY: Subdomain prefix list is shared via isLowValueSubdomain() from shared/valueNormalizers.js

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

  // WHY: isLowValueHost moved to routing layer (sourcePlanner._resolveQueueRoute).
  // Low-value hosts are now demoted to candidateQueue instead of hard-rejected.
  if (isThirdPartySearchPage(parsed)) {
    return { valid: false, reason: 'onsite_search_page', priority: 'skip' };
  }

  const priority = classifyUrlPriority(parsed, brand, model);
  return { valid: true, reason: 'ok', priority };
}

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

  if (path === '/' || path === '') {
    return 'low';
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1 && !pathContainsSlug(path, modelSlug)) {
    return 'low';
  }

  if (modelSlug && pathContainsSlug(path, modelSlug)) {
    return 'high';
  }

  if (brandSlug && pathContainsSlug(path, brandSlug)) {
    return 'medium';
  }

  return 'medium';
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function pathContainsSlug(path, slug) {
  if (!slug) return false;
  const words = slug.split('-').filter((word) => word.length >= 3);
  if (words.length === 0) return false;
  const lowerPath = path.toLowerCase();
  return words.filter((word) => lowerPath.includes(word)).length >= Math.ceil(words.length * 0.5);
}
