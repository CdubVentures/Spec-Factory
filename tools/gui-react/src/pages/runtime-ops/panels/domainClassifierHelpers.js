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
    { label: 'Safe', value: counts.safe, color: 'bg-green-500' },
    { label: 'Caution', value: counts.caution, color: 'bg-yellow-500' },
    { label: 'Blocked', value: counts.blocked, color: 'bg-red-500' },
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

export function computeAvgBudgetScore(health) {
  if (health.length === 0) return 0;
  const sum = health.reduce((acc, d) => acc + d.budget_score, 0);
  return Math.round(sum / health.length);
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
