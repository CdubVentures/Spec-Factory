export function maybeEmitRepairQuery({
  repairSearchEnabled = true,
  repairDedupeRule = 'domain_once',
  source = {},
  sourceUrl = '',
  statusCode = 0,
  reason = '',
  cooldownUntil = '',
  repairQueryByDomain = new Set(),
  config = {},
  requiredFields = [],
  jobIdentityLock = {},
  logger = null,
  normalizeHostTokenFn = (value = '') => String(value || ''),
  hostFromHttpUrlFn = () => '',
  buildRepairSearchQueryFn = () => '',
} = {}) {
  if (!repairSearchEnabled) return false;
  const domain = normalizeHostTokenFn(source?.host || hostFromHttpUrlFn(sourceUrl || source?.url || ''));
  if (!domain) {
    logger?.info?.('repair_query_suppressed', {
      reason: 'missing_domain',
      status: Number(statusCode || 0),
      source_url: String(sourceUrl || source?.url || '').trim() || null,
    });
    return false;
  }

  const dedupeKey = repairDedupeRule === 'domain_and_status'
    ? `${domain}:${Number(statusCode || 0)}`
    : domain;
  if (repairDedupeRule !== 'none' && repairQueryByDomain.has(dedupeKey)) {
    return false;
  }

  const query = buildRepairSearchQueryFn({
    domain,
    brand: jobIdentityLock?.brand || '',
    model: jobIdentityLock?.model || '',
    variant: jobIdentityLock?.variant || ''
  });
  if (!query) {
    logger?.info?.('repair_query_suppressed', {
      reason: 'empty_query',
      domain,
      status: Number(statusCode || 0),
      source_url: String(sourceUrl || source?.url || '').trim() || null,
    });
    return false;
  }

  if (repairDedupeRule !== 'none') {
    repairQueryByDomain.add(dedupeKey);
  }
  logger?.info?.('repair_query_enqueued', {
    domain,
    host: domain,
    query,
    dedupe_rule: repairDedupeRule,
    status: Number(statusCode || 0),
    reason: String(reason || '').trim() || null,
    source_url: String(sourceUrl || source?.url || '').trim() || null,
    cooldown_until: String(cooldownUntil || '').trim() || null,
    provider: String(config.searchEngines || '').trim() || 'none',
    doc_hint: 'manual_or_spec',
    field_targets: requiredFields.slice(0, 10)
  });
  return true;
}
