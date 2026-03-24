// Source Intel — Field reward engine
// Tracks per-field, per-method reward scores with exponential decay.
// Leaf module: no internal dependencies.

export function round(value, digits = 4) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

export function parseIsoMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function rewardKey(field, method) {
  return `${String(field || '').trim()}::${String(method || 'unknown').trim() || 'unknown'}`;
}

export const FIELD_REWARD_MAX_ENTRIES = 1200;

function trimLowestScoreEntries(map, maxEntries = FIELD_REWARD_MAX_ENTRIES) {
  const entries = Object.entries(map || {});
  if (entries.length <= maxEntries) {
    return map;
  }

  entries.sort((a, b) => {
    const aScore = Number.parseFloat(String(a[1]?.reward_score || 0));
    const bScore = Number.parseFloat(String(b[1]?.reward_score || 0));
    if (bScore !== aScore) {
      return bScore - aScore;
    }
    return (b[1]?.seen_count || 0) - (a[1]?.seen_count || 0);
  });
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function createFieldRewardEntry(field, method) {
  return {
    field: String(field || '').trim(),
    method: String(method || 'unknown').trim() || 'unknown',
    seen_count: 0,
    success_count: 0,
    fail_count: 0,
    contradiction_count: 0,
    success_rate: 0,
    contradiction_rate: 0,
    reward_score: 0,
    last_seen_at: null,
    last_decay_at: null
  };
}

export function ensureFieldRewardMap(entry) {
  if (!entry.field_method_reward || typeof entry.field_method_reward !== 'object') {
    entry.field_method_reward = {};
  }
  if (!entry.per_field_reward || typeof entry.per_field_reward !== 'object') {
    entry.per_field_reward = {};
  }
  return entry.field_method_reward;
}

export function applyDecayToRewardEntry(rewardEntry, nowMs, seenAt, halfLifeDays = 45) {
  const baseMs = parseIsoMs(rewardEntry.last_decay_at || rewardEntry.last_seen_at);
  if (baseMs === null) {
    rewardEntry.last_decay_at = seenAt;
    return;
  }

  const elapsedDays = (nowMs - baseMs) / 86_400_000;
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    rewardEntry.last_decay_at = seenAt;
    return;
  }

  const halfLife = Math.max(1, Number.parseFloat(String(halfLifeDays || 45)) || 45);
  const decayFactor = Math.pow(0.5, elapsedDays / halfLife);

  rewardEntry.seen_count = round((rewardEntry.seen_count || 0) * decayFactor, 6);
  rewardEntry.success_count = round((rewardEntry.success_count || 0) * decayFactor, 6);
  rewardEntry.fail_count = round((rewardEntry.fail_count || 0) * decayFactor, 6);
  rewardEntry.contradiction_count = round((rewardEntry.contradiction_count || 0) * decayFactor, 6);
  rewardEntry.last_decay_at = seenAt;
}

export function finalizeRewardEntry(rewardEntry) {
  const total = Math.max(0, rewardEntry.success_count + rewardEntry.fail_count + rewardEntry.contradiction_count);
  rewardEntry.seen_count = Math.max(rewardEntry.seen_count || 0, total);
  rewardEntry.success_rate = round(rewardEntry.success_count / Math.max(1, total), 6);
  rewardEntry.contradiction_rate = round(rewardEntry.contradiction_count / Math.max(1, total), 6);

  const rawReward =
    (rewardEntry.success_count - (rewardEntry.fail_count * 0.7) - (rewardEntry.contradiction_count * 1.2)) /
    Math.max(1, total);
  rewardEntry.reward_score = round(clamp(rawReward, -1, 1), 6);
}

export function updateFieldReward(entry, { field, method, outcome, seenAt, halfLifeDays }) {
  const rewardMap = ensureFieldRewardMap(entry);
  const key = rewardKey(field, method);
  if (!rewardMap[key]) {
    rewardMap[key] = createFieldRewardEntry(field, method);
  }

  const rewardEntry = rewardMap[key];
  const nowMs = parseIsoMs(seenAt) ?? Date.now();
  applyDecayToRewardEntry(rewardEntry, nowMs, seenAt, halfLifeDays);

  rewardEntry.seen_count += 1;
  if (outcome === 'success') {
    rewardEntry.success_count += 1;
  } else if (outcome === 'contradiction') {
    rewardEntry.contradiction_count += 1;
  } else {
    rewardEntry.fail_count += 1;
  }
  rewardEntry.last_seen_at = seenAt;
  rewardEntry.last_decay_at = seenAt;
  finalizeRewardEntry(rewardEntry);
  entry.field_method_reward = trimLowestScoreEntries(rewardMap, FIELD_REWARD_MAX_ENTRIES);
}

export function decayFieldRewardMap(entry, seenAt, halfLifeDays) {
  const rewardMap = ensureFieldRewardMap(entry);
  const nowMs = parseIsoMs(seenAt) ?? Date.now();
  for (const rewardEntry of Object.values(rewardMap)) {
    applyDecayToRewardEntry(rewardEntry, nowMs, seenAt, halfLifeDays);
    finalizeRewardEntry(rewardEntry);
  }
}

export function summarizeFieldRewards(fieldMethodReward) {
  const byField = {};
  for (const rewardEntry of Object.values(fieldMethodReward || {})) {
    const field = String(rewardEntry.field || '').trim();
    if (!field) {
      continue;
    }
    if (!byField[field]) {
      byField[field] = {
        field,
        sample_count: 0,
        weighted_score_total: 0,
        weighted_success_total: 0,
        weighted_contradiction_total: 0,
        best_method: rewardEntry.method,
        best_method_score: rewardEntry.reward_score || 0
      };
    }
    const bucket = byField[field];
    const seen = Math.max(0, rewardEntry.seen_count || 0);
    bucket.sample_count += seen;
    bucket.weighted_score_total += (rewardEntry.reward_score || 0) * Math.max(1, seen);
    bucket.weighted_success_total += (rewardEntry.success_rate || 0) * Math.max(1, seen);
    bucket.weighted_contradiction_total += (rewardEntry.contradiction_rate || 0) * Math.max(1, seen);
    if ((rewardEntry.reward_score || 0) > (bucket.best_method_score || -1)) {
      bucket.best_method = rewardEntry.method;
      bucket.best_method_score = rewardEntry.reward_score || 0;
    }
  }

  const output = {};
  for (const [field, bucket] of Object.entries(byField)) {
    const denom = Math.max(1, bucket.sample_count);
    output[field] = {
      field,
      sample_count: round(bucket.sample_count, 6),
      score: round(bucket.weighted_score_total / denom, 6),
      success_rate: round(bucket.weighted_success_total / denom, 6),
      contradiction_rate: round(bucket.weighted_contradiction_total / denom, 6),
      best_method: bucket.best_method,
      best_method_score: round(bucket.best_method_score || 0, 6)
    };
  }
  return output;
}
