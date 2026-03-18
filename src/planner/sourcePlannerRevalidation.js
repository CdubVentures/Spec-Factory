/**
 * URL revalidation for the enqueue pipeline.
 * Transport and safety checks only — no semantic/relevance rejections.
 * Semantic gates (low_value_host, manufacturer_brand_restricted, etc.)
 * are moved to the routing layer.
 */

import { normalizeHost, canonicalizeQueueUrl } from './sourcePlannerUrlUtils.js';
import { isDeniedHost } from '../categories/loader.js';
import { hostInSet } from './sourcePlannerUrlUtils.js';

// WHY: Third-party search result pages never contain product specs.
// Manufacturer search pages may redirect to product pages, so they are allowed.
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

/**
 * Revalidate a URL for transport and safety concerns only.
 *
 * @param {object} options
 * @param {string} options.url - Raw URL string
 * @param {object} options.revalidationCtx - { categoryConfig, blockedHosts }
 * @returns {{ rejected: boolean, reason: string|null, level: string|null, parsed?: URL, normalizedUrl?: string, host?: string }}
 */
export function revalidateUrl({ url, revalidationCtx }) {
  // Level: transport
  if (!url) {
    return { rejected: true, reason: 'empty_url', level: 'transport' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { rejected: true, reason: 'invalid_url', level: 'transport' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { rejected: true, reason: 'bad_protocol', level: 'transport' };
  }

  if (isThirdPartySearchPage(parsed)) {
    return { rejected: true, reason: 'search_page', level: 'transport' };
  }

  // Compute normalized values for downstream use
  const normalizedUrl = canonicalizeQueueUrl(parsed);
  const host = normalizeHost(parsed.hostname);

  // Level: safety
  if (!host || isDeniedHost(host, revalidationCtx.categoryConfig)) {
    return { rejected: true, reason: 'denied_host', level: 'safety' };
  }

  if (hostInSet(host, revalidationCtx.blockedHosts)) {
    return { rejected: true, reason: 'blocked_host', level: 'safety' };
  }

  return { rejected: false, reason: null, level: null, parsed, normalizedUrl, host };
}
