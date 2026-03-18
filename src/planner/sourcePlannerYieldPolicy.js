/**
 * Host yield state resolution for enqueue routing decisions.
 * Determines whether a host is promoted, normal, caution, capped, or blocked
 * based on field yield data and host counts.
 */

import { hostInSet } from './sourcePlannerUrlUtils.js';

// WHY: Min 3 attempts required before yield state affects routing.
// Prevents premature promotion/demotion from insufficient data.
const MIN_SUPPORT = 3;

// WHY: Laplace smoothing prevents zero-division and extreme estimates.
// (accepted + 1) / (seen + 2) → prior of 0.5 with pseudocounts.
function laplaceSmoothRate(accepted, seen) {
  return (accepted + 1) / (seen + 2);
}

/**
 * Resolve the yield state for a host based on field yield data.
 *
 * @param {object} options
 * @param {string} options.host - Normalized hostname
 * @param {string} options.rootDomain - Root domain
 * @param {object} options.fieldYieldMap - { by_host?: { [host]: { accepted, seen } }, by_domain?: { [domain]: { accepted, seen } } }
 * @param {Set} options.blockedHosts - Set of blocked hosts
 * @param {Map} options.hostCounts - Map of host → count of queued/visited URLs
 * @param {number} options.maxPagesPerDomain - Domain cap threshold
 * @returns {{ state: 'promoted'|'normal'|'caution'|'capped'|'blocked', reason: string }}
 */
export function resolveHostYieldState({
  host,
  rootDomain,
  fieldYieldMap = {},
  blockedHosts = new Set(),
  hostCounts = new Map(),
  maxPagesPerDomain = 2,
}) {
  // Blocked takes absolute precedence
  if (hostInSet(host, blockedHosts)) {
    return { state: 'blocked', reason: 'blocked_host' };
  }

  // Capped: informational — eviction may still admit
  const currentCount = hostCounts.get(host) || 0;
  if (currentCount >= maxPagesPerDomain) {
    return { state: 'capped', reason: 'host_count_at_cap' };
  }

  // Host-level yield takes precedence over domain-level
  const hostYield = fieldYieldMap?.by_host?.[host];
  if (hostYield && typeof hostYield.seen === 'number' && hostYield.seen >= MIN_SUPPORT) {
    const rate = laplaceSmoothRate(hostYield.accepted || 0, hostYield.seen);
    if (rate > 0.6) {
      return { state: 'promoted', reason: 'high_yield_host' };
    }
    if (rate < 0.2) {
      return { state: 'caution', reason: 'low_yield_host' };
    }
    return { state: 'normal', reason: 'moderate_yield_host' };
  }

  // Domain-level fallback
  const domainYield = fieldYieldMap?.by_domain?.[rootDomain];
  if (domainYield && typeof domainYield.seen === 'number' && domainYield.seen >= MIN_SUPPORT) {
    const rate = laplaceSmoothRate(domainYield.accepted || 0, domainYield.seen);
    if (rate > 0.6) {
      return { state: 'promoted', reason: 'high_yield_domain' };
    }
    if (rate < 0.2) {
      return { state: 'caution', reason: 'low_yield_domain' };
    }
    return { state: 'normal', reason: 'moderate_yield_domain' };
  }

  // Under min-support or no data
  if (hostYield || domainYield) {
    return { state: 'normal', reason: 'below_min_support' };
  }

  return { state: 'normal', reason: 'no_yield_data' };
}
