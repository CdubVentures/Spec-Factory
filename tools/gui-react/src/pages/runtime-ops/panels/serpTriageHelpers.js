export function computeTriageDecisionCounts(triage) {
  const counts = { keep: 0, maybe: 0, drop: 0 };
  for (const t of triage) {
    for (const c of t.candidates) {
      if (c.decision === 'keep') counts.keep++;
      else if (c.decision === 'maybe') counts.maybe++;
      else counts.drop++;
    }
  }
  return counts;
}

export function computeTriageTopDomains(triage, limit) {
  const map = new Map();
  for (const t of triage) {
    for (const c of t.candidates) {
      map.set(c.domain, (map.get(c.domain) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeTriageUniqueDomains(triage) {
  const domains = new Set();
  for (const t of triage) {
    for (const c of t.candidates) {
      domains.add(c.domain);
    }
  }
  return domains.size;
}

export function buildTriageDecisionSegments(counts) {
  return [
    { label: 'Keep', value: counts.keep, color: 'bg-green-500' },
    { label: 'Maybe', value: counts.maybe, color: 'bg-yellow-500' },
    { label: 'Drop', value: counts.drop, color: 'bg-red-500' },
  ];
}

export function buildTriageFunnelBullets(triage, calls) {
  if (triage.length === 0 && calls.length === 0) return [];

  const bullets = [];
  const counts = computeTriageDecisionCounts(triage);
  const totalCandidates = triage.reduce((sum, t) => sum + t.candidates.length, 0);
  const uniqueDomains = computeTriageUniqueDomains(triage);

  if (totalCandidates > 0) {
    bullets.push(`${totalCandidates} candidate URLs evaluated across ${triage.length} quer${triage.length === 1 ? 'y' : 'ies'}`);
  }

  if (uniqueDomains > 0) {
    bullets.push(`${uniqueDomains} unique domain${uniqueDomains !== 1 ? 's' : ''} represented`);
  }

  const total = counts.keep + counts.maybe + counts.drop;
  if (total > 0) {
    const parts = [];
    if (counts.keep > 0) parts.push(`${counts.keep} kept`);
    if (counts.maybe > 0) parts.push(`${counts.maybe} maybe`);
    if (counts.drop > 0) parts.push(`${counts.drop} dropped`);
    bullets.push(`Decision: ${parts.join(', ')}`);
  }

  if (calls.length > 0 && calls[0].model) {
    bullets.push(`Scored by ${calls[0].model}`);
  }

  return bullets;
}

export function computeTriageDedupeStats(triage) {
  const urls = [];
  const urlSet = new Set();
  for (const t of triage) {
    for (const c of t.candidates) {
      urls.push(c.url);
      urlSet.add(c.url);
    }
  }
  return {
    totalCandidates: urls.length,
    uniqueUrls: urlSet.size,
    deduped: urls.length - urlSet.size,
  };
}

export function buildTriageDomainDecisionBreakdown(triage) {
  const map = new Map();
  for (const t of triage) {
    for (const c of t.candidates) {
      if (!map.has(c.domain)) {
        map.set(c.domain, { keep: 0, maybe: 0, drop: 0 });
      }
      const entry = map.get(c.domain);
      if (c.decision === 'keep') entry.keep++;
      else if (c.decision === 'maybe') entry.maybe++;
      else entry.drop++;
    }
  }
  return map;
}
