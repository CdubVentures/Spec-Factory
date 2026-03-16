export function maybeApplyBlockedDomainCooldown({
  source = {},
  statusCode = 0,
  message = '',
  blockedDomainHitCount = new Map(),
  blockedDomainThreshold = 3,
  blockedDomainsApplied = new Set(),
  planner = null,
  logger = null,
  normalizeHostTokenFn = (value = '') => String(value || ''),
  hostFromHttpUrlFn = () => '',
} = {}) {
  const domain = normalizeHostTokenFn(source?.host || hostFromHttpUrlFn(source?.url || ''));
  if (!domain) return false;

  const blockedByStatus = Number(statusCode) === 403 || Number(statusCode) === 429;
  const blockedByMessage = /(403|429|forbidden|captcha|rate.?limit|blocked)/i.test(String(message || ''));
  if (!blockedByStatus && !blockedByMessage) {
    return false;
  }

  const hitCount = (blockedDomainHitCount.get(domain) || 0) + 1;
  blockedDomainHitCount.set(domain, hitCount);
  if (hitCount < blockedDomainThreshold) {
    return false;
  }
  if (blockedDomainsApplied.has(domain)) {
    return false;
  }

  blockedDomainsApplied.add(domain);
  const removedCount = planner?.blockHost?.(domain, Number(statusCode) === 429 ? 'status_429_backoff' : 'status_403_backoff') || 0;
  logger?.warn?.('blocked_domain_cooldown_applied', {
    host: domain,
    status: Number(statusCode || 0) || null,
    blocked_count: hitCount,
    threshold: blockedDomainThreshold,
    removed_count: removedCount
  });
  return true;
}
