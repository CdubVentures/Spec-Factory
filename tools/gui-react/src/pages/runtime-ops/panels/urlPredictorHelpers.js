export function computePredictionDecisionCounts(predictions) {
  const counts = { fetch: 0, later: 0, skip: 0 };
  for (const p of predictions) {
    if (p.decision === 'fetch') counts.fetch++;
    else if (p.decision === 'later') counts.later++;
    else counts.skip++;
  }
  return counts;
}

export function computeTopPredictionDomains(predictions, limit) {
  const map = new Map();
  for (const p of predictions) {
    map.set(p.domain, (map.get(p.domain) || 0) + 1);
  }
  return [...map.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeUniquePredictionDomains(predictions) {
  const domains = new Set(predictions.map((p) => p.domain));
  return domains.size;
}

export function buildPredictionDecisionSegments(counts) {
  return [
    { label: 'Fetch', value: counts.fetch, color: 'sf-metric-fill-success' },
    { label: 'Later', value: counts.later, color: 'sf-metric-fill-warning' },
    { label: 'Skip', value: counts.skip, color: 'sf-metric-fill-danger' },
  ];
}

export function computeFieldCoverageMatrix(predictions) {
  if (predictions.length === 0) return { fields: [], rows: [] };

  const fieldSet = new Set();
  for (const p of predictions) {
    for (const f of p.target_fields) fieldSet.add(f);
  }
  const fields = [...fieldSet].sort();

  const capped = predictions.slice(0, 20);
  const rows = capped.map((p) => {
    const cells = {};
    for (const f of fields) {
      cells[f] = p.target_fields.includes(f) ? p.predicted_payoff / 100 : 0;
    }
    return { url: p.url, domain: p.domain, cells };
  });

  return { fields, rows };
}

export function computeAveragePayoff(predictions) {
  if (predictions.length === 0) return 0;
  const sum = predictions.reduce((acc, p) => acc + p.predicted_payoff, 0);
  return Math.round(sum / predictions.length);
}

export function computeRiskFlagDistribution(predictions) {
  const counts = {};
  for (const p of predictions) {
    for (const flag of p.risk_flags) {
      counts[flag] = (counts[flag] || 0) + 1;
    }
  }
  return counts;
}

export function buildPredictorFunnelBullets(predictions, remainingBudget) {
  if (predictions.length === 0) return [];

  const bullets = [];
  const counts = computePredictionDecisionCounts(predictions);
  const uniqueDomains = computeUniquePredictionDomains(predictions);

  bullets.push(`${predictions.length} candidate URLs evaluated across ${uniqueDomains} domain${uniqueDomains !== 1 ? 's' : ''}`);

  if (counts.fetch > 0) {
    bullets.push(`${counts.fetch} selected for immediate fetch`);
  }

  if (counts.later > 0) {
    bullets.push(`${counts.later} deferred for later rounds`);
  }

  if (counts.skip > 0) {
    bullets.push(`${counts.skip} skipped (low payoff or risk)`);
  }

  if (remainingBudget > 0) {
    bullets.push(`${remainingBudget} fetch budget slots remaining`);
  }

  const totalRiskFlags = predictions.reduce((sum, p) => sum + p.risk_flags.length, 0);
  if (totalRiskFlags > 0) {
    const urlsWithRisk = predictions.filter((p) => p.risk_flags.length > 0).length;
    bullets.push(`${totalRiskFlags} risk flag${totalRiskFlags !== 1 ? 's' : ''} across ${urlsWithRisk} URL${urlsWithRisk !== 1 ? 's' : ''}`);
  }

  return bullets;
}
