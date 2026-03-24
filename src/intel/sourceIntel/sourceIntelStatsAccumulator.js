// Source Intel — Domain/path/brand stats accumulator
// Creates, hydrates, and finalizes per-domain statistical entries.
// Depends on reward engine for decay and reward summarization.

import {
  round,
  decayFieldRewardMap,
  summarizeFieldRewards,
} from './sourceIntelRewardEngine.js';

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createStatsTemplate(extra = {}) {
  return {
    attempts: 0,
    http_ok_count: 0,
    http_ok: 0,
    identity_match_count: 0,
    identity_match: 0,
    major_anchor_conflict_count: 0,
    major_anchor_conflicts: 0,
    fields_contributed_count: 0,
    fields_accepted_count: 0,
    accepted_fields_count: 0,
    accepted_critical_fields_count: 0,
    products_seen: 0,
    recent_products: [],
    approved_attempts: 0,
    candidate_attempts: 0,
    per_field_helpfulness: {},
    per_field_accept_count: {},
    field_method_reward: {},
    per_field_reward: {},
    field_reward_strength: 0,
    endpoint_signal_count: 0,
    endpoint_signal_score_total: 0,
    endpoint_signal_avg_score: 0,
    parser_runs: 0,
    parser_success_count: 0,
    parser_zero_candidate_count: 0,
    parser_identity_miss_count: 0,
    parser_anchor_block_count: 0,
    parser_health_score_total: 0,
    parser_health_score: 0,
    fingerprint_counts: {},
    fingerprint_unique_count: 0,
    fingerprint_drift_rate: 0,
    last_seen_at: null,
    ...extra
  };
}

function hydrateStatsShape(entry) {
  const defaults = createStatsTemplate();
  for (const [key, value] of Object.entries(defaults)) {
    if (entry[key] !== undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      entry[key] = [];
    } else if (value && typeof value === 'object') {
      entry[key] = {};
    } else {
      entry[key] = value;
    }
  }
  return entry;
}

export function ensureDomainStats(domains, rootDomain) {
  if (!domains[rootDomain]) {
    domains[rootDomain] = createStatsTemplate({
      rootDomain,
      per_brand: {},
      per_path: {}
    });
  } else if (!domains[rootDomain].per_brand) {
    domains[rootDomain].per_brand = {};
  }
  if (!domains[rootDomain].per_path) {
    domains[rootDomain].per_path = {};
  }
  return hydrateStatsShape(domains[rootDomain]);
}

export function ensurePathStats(domainEntry, pathKey) {
  const normalizedPath = String(pathKey || '/');
  if (!domainEntry.per_path[normalizedPath]) {
    domainEntry.per_path[normalizedPath] = createStatsTemplate({
      path: normalizedPath
    });
  }
  return hydrateStatsShape(domainEntry.per_path[normalizedPath]);
}

export function ensureBrandStats(domainEntry, brand) {
  const normalizedBrand = String(brand || '').trim();
  if (!normalizedBrand) {
    return null;
  }

  const brandKey = slug(normalizedBrand);
  if (!brandKey) {
    return null;
  }

  if (!domainEntry.per_brand[brandKey]) {
    domainEntry.per_brand[brandKey] = createStatsTemplate({
      brand: normalizedBrand,
      brand_key: brandKey
    });
  }
  return hydrateStatsShape(domainEntry.per_brand[brandKey]);
}

function incrementMapValue(map, key, delta = 1) {
  map[key] = (map[key] || 0) + delta;
}

function trimLowestCountEntries(map, maxEntries = 64) {
  const entries = Object.entries(map || {});
  if (entries.length <= maxEntries) {
    return map;
  }

  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, maxEntries));
}

export function applySourceDiagnostics(entry, source) {
  const endpointSignals = source.endpointSignals || [];
  if (endpointSignals.length > 0) {
    const scoreSum = endpointSignals.reduce((sum, row) => sum + (row.signal_score || 0), 0);
    entry.endpoint_signal_count += endpointSignals.length;
    entry.endpoint_signal_score_total += scoreSum;
  }

  const parser = source.parserHealth || null;
  if (parser) {
    entry.parser_runs += 1;
    entry.parser_health_score_total += parser.health_score || 0;
    if ((parser.candidate_count || 0) > 0) {
      entry.parser_success_count += 1;
    } else {
      entry.parser_zero_candidate_count += 1;
    }
    if (parser.identity_match === false) {
      entry.parser_identity_miss_count += 1;
    }
    if ((parser.major_anchor_conflicts || 0) > 0) {
      entry.parser_anchor_block_count += 1;
    }
  }

  const fingerprintId = source.fingerprint?.id;
  if (fingerprintId) {
    incrementMapValue(entry.fingerprint_counts, fingerprintId, 1);
    entry.fingerprint_counts = trimLowestCountEntries(entry.fingerprint_counts, 96);
  }
}

export function updateDerivedStats(entry, seenAt, halfLifeDays = 45) {
  decayFieldRewardMap(entry, seenAt, halfLifeDays);
  entry.per_field_reward = summarizeFieldRewards(entry.field_method_reward);
  const rewardRows = Object.values(entry.per_field_reward || {});
  entry.field_reward_strength = rewardRows.length
    ? round(
      rewardRows.reduce((sum, row) => sum + Math.max(-1, Math.min(1, row.score || 0)), 0) / rewardRows.length,
      6
    )
    : 0;

  const attempts = Math.max(1, entry.attempts || 0);
  entry.http_ok_rate = round((entry.http_ok_count || 0) / attempts, 6);
  entry.identity_match_rate = round((entry.identity_match_count || 0) / attempts, 6);
  entry.major_anchor_conflict_rate = round((entry.major_anchor_conflict_count || 0) / attempts, 6);
  entry.acceptance_yield = round(
    (entry.fields_accepted_count || 0) / Math.max(1, entry.fields_contributed_count || 0),
    6
  );
  entry.endpoint_signal_avg_score = round(
    (entry.endpoint_signal_score_total || 0) / Math.max(1, entry.endpoint_signal_count || 0),
    6
  );
  entry.parser_health_score = round(
    (entry.parser_health_score_total || 0) / Math.max(1, entry.parser_runs || 0),
    6
  );
  entry.fingerprint_unique_count = Object.keys(entry.fingerprint_counts || {}).length;
  entry.fingerprint_drift_rate = round(
    entry.fingerprint_unique_count / Math.max(1, entry.parser_runs || 0),
    6
  );

  const yieldBoost = Math.min(1, entry.acceptance_yield * 10);
  const parserBoost = Math.min(1, entry.parser_health_score || 0);
  const endpointBoost = Math.min(1, (entry.endpoint_signal_avg_score || 0) / 4);
  const rewardBoost = Math.max(-0.15, Math.min(0.15, (entry.field_reward_strength || 0) * 0.15));
  entry.planner_score = round(
    (entry.identity_match_rate * 0.5) +
      ((1 - entry.major_anchor_conflict_rate) * 0.2) +
      (entry.http_ok_rate * 0.1) +
      (yieldBoost * 0.15) +
      (parserBoost * 0.03) +
      (endpointBoost * 0.02) +
      rewardBoost,
    6
  );
}

export function syncNamedMetrics(entry, seenAt) {
  entry.http_ok = entry.http_ok_count || 0;
  entry.identity_match = entry.identity_match_count || 0;
  entry.major_anchor_conflicts = entry.major_anchor_conflict_count || 0;
  entry.accepted_fields_count = entry.fields_accepted_count || 0;
  entry.per_field_accept_count = { ...(entry.per_field_helpfulness || {}) };
  entry.parser_success_rate = round(
    (entry.parser_success_count || 0) / Math.max(1, entry.parser_runs || 0),
    6
  );
  entry.parser_identity_miss_rate = round(
    (entry.parser_identity_miss_count || 0) / Math.max(1, entry.parser_runs || 0),
    6
  );
  entry.last_seen_at = seenAt;
}
