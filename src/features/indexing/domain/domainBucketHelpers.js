import { normalizeDomainToken, toInt, toFloat, parseTsMs, clampScore } from '../../../shared/valueNormalizers.js';

export const SITE_KIND_RANK = {
  manufacturer: 0,
  review: 1,
  database: 2,
  retailer: 3,
  community: 4,
  aggregator: 5,
  other: 9
};

export const REVIEW_DOMAIN_HINTS = [
  'rtings.com',
  'techpowerup.com',
  'eloshapes.com',
  'mousespecs.org',
  'tftcentral.co.uk',
  'displayninja.com'
];

export const RETAILER_DOMAIN_HINTS = [
  'amazon.',
  'bestbuy.',
  'newegg.',
  'walmart.',
  'microcenter.',
  'bhphotovideo.'
];

export const AGGREGATOR_DOMAIN_HINTS = [
  'wikipedia.org',
  'reddit.com',
  'fandom.com'
];

export const FETCH_OUTCOME_KEYS = [
  'ok',
  'not_found',
  'blocked',
  'rate_limited',
  'login_wall',
  'bot_challenge',
  'bad_content',
  'server_error',
  'network_timeout',
  'fetch_error'
];

export function inferSiteKindByDomain(domain = '') {
  const host = normalizeDomainToken(domain);
  if (!host) return 'other';
  if (REVIEW_DOMAIN_HINTS.some((hint) => host.includes(hint))) return 'review';
  if (RETAILER_DOMAIN_HINTS.some((hint) => host.includes(hint))) return 'retailer';
  if (AGGREGATOR_DOMAIN_HINTS.some((hint) => host.includes(hint))) return 'aggregator';
  return 'other';
}

export function classifySiteKind({
  domain = '',
  role = '',
  tierName = '',
  brandTokens = new Set()
} = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const normalizedTierName = String(tierName || '').trim().toLowerCase();
  if (normalizedRole === 'manufacturer' || normalizedTierName === 'manufacturer') return 'manufacturer';
  if (normalizedRole === 'review' || normalizedTierName === 'review') return 'review';
  if (normalizedRole === 'retailer' || normalizedTierName === 'retailer') return 'retailer';
  if (normalizedRole === 'database' || normalizedTierName === 'database') return 'database';
  if (normalizedRole === 'community' || normalizedTierName === 'community') return 'community';
  if (normalizedRole === 'aggregator' || normalizedTierName === 'aggregator') return 'aggregator';

  const host = normalizeDomainToken(domain);
  if (host) {
    for (const token of brandTokens) {
      if (!token) continue;
      if (host.includes(token)) return 'manufacturer';
    }
  }
  return inferSiteKindByDomain(host);
}

export function isHelperPseudoDomain(domain = '') {
  const host = normalizeDomainToken(domain);
  const legacyHelperHostDash = 'helper-files.local';
  const legacyHelperHostUnderscore = `helper${'_files'}.local`;
  return host === legacyHelperHostDash || host === legacyHelperHostUnderscore;
}

export function createFetchOutcomeCounters() {
  return FETCH_OUTCOME_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

export function normalizeFetchOutcome(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return '';
  return FETCH_OUTCOME_KEYS.includes(token) ? token : '';
}

export function classifyFetchOutcomeFromEvent(evt = {}) {
  const explicit = normalizeFetchOutcome(evt.outcome);
  if (explicit) return explicit;

  const code = toInt(evt.status, 0);
  const message = String(evt.message || evt.detail || '').toLowerCase();
  const contentType = String(evt.content_type || '').toLowerCase();

  const looksBotChallenge = /(captcha|cloudflare|cf-ray|bot.?challenge|are you human|human verification|robot check)/.test(message);
  const looksRateLimited = /(429|rate.?limit|too many requests|throttl)/.test(message);
  const looksLoginWall = /(401|sign[ -]?in|login|authenticate|account required|subscription required)/.test(message);
  const looksBlocked = /(403|forbidden|blocked|access denied|denied)/.test(message);
  const looksTimeout = /(timeout|timed out|etimedout|econnreset|econnrefused|socket hang up|network error|dns)/.test(message);
  const looksBadContent = /(parse|json|xml|cheerio|dom|extract|malformed|invalid content|unsupported content)/.test(message);

  if (code >= 200 && code < 400) {
    if (contentType.includes('application/octet-stream')) return 'bad_content';
    return 'ok';
  }
  if (code === 404 || code === 410) return 'not_found';
  if (code === 429) return 'rate_limited';
  if (code === 401 || code === 407) return 'login_wall';
  if (code === 403) {
    if (looksBotChallenge) return 'bot_challenge';
    if (looksLoginWall) return 'login_wall';
    return 'blocked';
  }
  if (code >= 500) return 'server_error';
  if (code >= 400) return 'blocked';
  if (looksBotChallenge) return 'bot_challenge';
  if (looksRateLimited) return 'rate_limited';
  if (looksLoginWall) return 'login_wall';
  if (looksBlocked) return 'blocked';
  if (looksBadContent) return 'bad_content';
  if (looksTimeout) return 'network_timeout';
  return 'fetch_error';
}

export function createDomainBucket(domain, siteKind = 'other') {
  return {
    domain,
    site_kind: siteKind,
    candidates_checked_urls: new Set(),
    urls_selected_urls: new Set(),
    fetched_ok_urls: new Set(),
    indexed_urls: new Set(),
    seen_urls: new Set(),
    url_stats: new Map(),
    started_count: 0,
    completed_count: 0,
    dedupe_hits: 0,
    err_404: 0,
    err_404_by_url: new Map(),
    blocked_count: 0,
    blocked_by_url: new Map(),
    parse_fail_count: 0,
    outcome_counts: createFetchOutcomeCounters(),
    fetch_durations: [],
    fields_filled_count: 0,
    evidence_hits: 0,
    evidence_used: 0,
    fields_covered: new Set(),
    publish_gated_fields: new Set(),
    last_success_at: '',
    next_retry_at: '',
    roles_seen: new Set()
  };
}

export function createUrlStat(url) {
  return {
    url: String(url || ''),
    checked_count: 0,
    selected_count: 0,
    fetch_started_count: 0,
    processed_count: 0,
    fetched_ok: false,
    indexed: false,
    err_404_count: 0,
    blocked_count: 0,
    parse_fail_count: 0,
    last_outcome: '',
    last_status: 0,
    last_event: '',
    last_ts: ''
  };
}

export function ensureUrlStat(bucket, url) {
  if (!bucket || !url) return null;
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return null;
  if (!bucket.url_stats.has(normalizedUrl)) {
    bucket.url_stats.set(normalizedUrl, createUrlStat(normalizedUrl));
  }
  return bucket.url_stats.get(normalizedUrl);
}

export function bumpUrlStatEvent(urlStat, { eventName = '', ts = '', status = 0 } = {}) {
  if (!urlStat) return;
  const safeTs = String(ts || '').trim();
  const safeEvent = String(eventName || '').trim();
  const statusCode = Number.parseInt(String(status || ''), 10);
  if (safeTs && (!urlStat.last_ts || parseTsMs(safeTs) >= parseTsMs(urlStat.last_ts))) {
    urlStat.last_ts = safeTs;
    urlStat.last_event = safeEvent || urlStat.last_event;
    if (Number.isFinite(statusCode) && statusCode > 0) {
      urlStat.last_status = statusCode;
    }
  }
}

export function choosePreferredSiteKind(currentKind, nextKind) {
  const currentRank = SITE_KIND_RANK[currentKind] ?? 99;
  const nextRank = SITE_KIND_RANK[nextKind] ?? 99;
  return nextRank < currentRank ? nextKind : currentKind;
}

export function cooldownSecondsRemaining(nextRetryAt, nowMs = Date.now()) {
  const retryAtMs = parseTsMs(nextRetryAt);
  if (!Number.isFinite(retryAtMs)) return 0;
  return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}

export function resolveHostBudget(bucket, cooldownSeconds = 0) {
  const outcomes = bucket?.outcome_counts || createFetchOutcomeCounters();
  const started = toInt(bucket?.started_count, 0);
  const completed = toInt(bucket?.completed_count, 0);
  const inFlight = Math.max(0, started - completed);

  let score = 100;
  score -= toInt(outcomes.not_found, 0) * 6;
  score -= toInt(outcomes.blocked, 0) * 8;
  score -= toInt(outcomes.rate_limited, 0) * 12;
  score -= toInt(outcomes.login_wall, 0) * 10;
  score -= toInt(outcomes.bot_challenge, 0) * 14;
  score -= toInt(outcomes.bad_content, 0) * 8;
  score -= toInt(outcomes.server_error, 0) * 6;
  score -= toInt(outcomes.network_timeout, 0) * 5;
  score -= toInt(outcomes.fetch_error, 0) * 4;
  score -= toInt(bucket?.dedupe_hits, 0);
  score += Math.min(12, toInt(outcomes.ok, 0) * 2);
  score += Math.min(10, toInt(bucket?.evidence_used, 0) * 2);
  score = clampScore(score, 0, 100);

  let state = 'open';
  const blockedSignals = (
    toInt(outcomes.blocked, 0)
    + toInt(outcomes.rate_limited, 0)
    + toInt(outcomes.login_wall, 0)
    + toInt(outcomes.bot_challenge, 0)
  );
  if (cooldownSeconds > 0 && (score <= 30 || blockedSignals >= 2)) {
    state = 'blocked';
  } else if (cooldownSeconds > 0) {
    state = 'backoff';
  } else if (score < 55 || toInt(outcomes.bad_content, 0) > 0 || toInt(bucket?.parse_fail_count, 0) > 0) {
    state = 'degraded';
  } else if (inFlight > 0) {
    state = 'active';
  }

  return {
    score,
    state
  };
}

export function resolveDomainChecklistStatus(bucket) {
  const candidatesChecked = bucket.candidates_checked_urls.size;
  const urlsSelected = bucket.urls_selected_urls.size;
  const pagesFetchedOk = bucket.fetched_ok_urls.size;
  const hasPositiveSignal = (
    pagesFetchedOk > 0
    || bucket.indexed_urls.size > 0
    || bucket.fields_filled_count > 0
    || bucket.evidence_hits > 0
    || bucket.evidence_used > 0
  );

  if (candidatesChecked === 0 && urlsSelected === 0) return 'not_started';
  if (bucket.started_count > bucket.completed_count) return 'in_progress';
  if (hasPositiveSignal) return 'good';
  if (bucket.blocked_count > 0 && pagesFetchedOk === 0) return 'blocked';
  if (bucket.err_404 > 0 && pagesFetchedOk === 0 && bucket.blocked_count === 0) return 'dead_urls(404)';
  return 'in_progress';
}
