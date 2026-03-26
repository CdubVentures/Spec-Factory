export function computeSafetyClassCounts(health) {
  const counts = { safe: 0, caution: 0, blocked: 0 };
  for (const d of health) {
    if (d.safety_class === 'safe') counts.safe++;
    else if (d.safety_class === 'blocked' || d.safety_class === 'unsafe') counts.blocked++;
    else counts.caution++;
  }
  return counts;
}

export function computeRoleCounts(health) {
  const counts = { manufacturer: 0, review: 0, retail: 0, database: 0, unknown: 0 };
  for (const d of health) {
    const role = d.role || '';
    if (role === 'manufacturer') counts.manufacturer++;
    else if (role === 'review' || role === 'lab_review') counts.review++;
    else if (role === 'retail') counts.retail++;
    else if (role === 'database') counts.database++;
    else counts.unknown++;
  }
  return counts;
}

export function computeTopProblematicDomains(health, limit) {
  return [...health]
    .sort((a, b) => {
      const aProblematic = a.safety_class === 'blocked' || a.safety_class === 'unsafe' || a.cooldown_remaining > 0;
      const bProblematic = b.safety_class === 'blocked' || b.safety_class === 'unsafe' || b.cooldown_remaining > 0;
      if (aProblematic && !bProblematic) return -1;
      if (!aProblematic && bProblematic) return 1;
      return a.success_rate - b.success_rate;
    })
    .slice(0, limit);
}

export function computeUniqueDomains(health) {
  const domains = new Set(health.map((d) => d.domain));
  return domains.size;
}

export function buildSafetyClassSegments(counts) {
  return [
    { label: 'Safe', value: counts.safe, color: 'sf-metric-fill-success' },
    { label: 'Caution', value: counts.caution, color: 'sf-metric-fill-warning' },
    { label: 'Blocked', value: counts.blocked, color: 'sf-metric-fill-danger' },
  ];
}

export function buildDomainFunnelBullets(health, calls) {
  if (health.length === 0 && calls.length === 0) return [];

  const bullets = [];
  const uniqueCount = computeUniqueDomains(health);
  const safetyCounts = computeSafetyClassCounts(health);
  const roleCounts = computeRoleCounts(health);

  if (health.length > 0) {
    bullets.push(`${uniqueCount} domain${uniqueCount !== 1 ? 's' : ''} classified`);
  }

  const total = safetyCounts.safe + safetyCounts.caution + safetyCounts.blocked;
  if (total > 0) {
    const parts = [];
    if (safetyCounts.safe > 0) parts.push(`${safetyCounts.safe} safe`);
    if (safetyCounts.caution > 0) parts.push(`${safetyCounts.caution} caution`);
    if (safetyCounts.blocked > 0) parts.push(`${safetyCounts.blocked} blocked`);
    bullets.push(`Safety: ${parts.join(', ')}`);
  }

  const cooldownCount = health.filter((d) => d.cooldown_remaining > 0).length;
  if (cooldownCount > 0) {
    bullets.push(`${cooldownCount} domain${cooldownCount !== 1 ? 's' : ''} in cooldown`);
  }

  const roleParts = [];
  if (roleCounts.manufacturer > 0) roleParts.push(`${roleCounts.manufacturer} manufacturer`);
  if (roleCounts.review > 0) roleParts.push(`${roleCounts.review} review`);
  if (roleCounts.retail > 0) roleParts.push(`${roleCounts.retail} retail`);
  if (roleCounts.database > 0) roleParts.push(`${roleCounts.database} database`);
  if (roleCounts.unknown > 0) roleParts.push(`${roleCounts.unknown} unknown`);
  if (roleParts.length > 0) {
    bullets.push(`Roles: ${roleParts.join(', ')}`);
  }

  if (calls.length > 0 && calls[0].model) {
    bullets.push(`Classified by ${calls[0].model}`);
  }

  return bullets;
}

export function computeCooldownSummary(health) {
  let totalInCooldown = 0;
  let maxRemainingSeconds = 0;
  for (const d of health) {
    if (d.cooldown_remaining > 0) {
      totalInCooldown++;
      if (d.cooldown_remaining > maxRemainingSeconds) {
        maxRemainingSeconds = d.cooldown_remaining;
      }
    }
  }
  return { totalInCooldown, maxRemainingSeconds };
}

export function computeFetchSummary(health) {
  let totalFetches = 0;
  let totalBlocks = 0;
  let totalTimeouts = 0;
  for (const d of health) {
    totalFetches += d.fetch_count || 0;
    totalBlocks += d.blocked_count || 0;
    totalTimeouts += d.timeout_count || 0;
  }
  return { totalFetches, totalBlocks, totalTimeouts };
}

export function groupKeptUrlsByDomain(serpTriage) {
  const byDomain = new Map();
  for (const result of serpTriage) {
    for (const candidate of result.candidates || []) {
      if (candidate.decision !== 'keep') continue;
      const domain = candidate.domain || '';
      if (!domain) continue;
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(candidate);
    }
  }
  return byDomain;
}

export function computeUrlSafetyBreakdown(urlsByDomain, health) {
  const safetyByDomain = new Map();
  for (const d of health) {
    safetyByDomain.set(d.domain, d.safety_class);
  }
  let safeUrls = 0;
  let cautionUrls = 0;
  let blockedUrls = 0;
  for (const [domain, urls] of urlsByDomain) {
    const safety = safetyByDomain.get(domain) || '';
    const count = urls.length;
    if (safety === 'safe') safeUrls += count;
    else if (safety === 'blocked' || safety === 'unsafe') blockedUrls += count;
    else cautionUrls += count;
  }
  return { safeUrls, cautionUrls, blockedUrls, totalKeptUrls: safeUrls + cautionUrls + blockedUrls };
}
