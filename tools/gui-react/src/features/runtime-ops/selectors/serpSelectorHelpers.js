export function computeSerpSelectorDecisionCounts(triage) {
  const counts = { keep: 0, dropped_by_llm: 0, hard_drop: 0 };
  for (const t of triage) {
    for (const c of t.candidates) {
      if (c.decision === 'keep') counts.keep++;
      else if (c.decision === 'hard_drop') counts.hard_drop++;
      else counts.dropped_by_llm++;
    }
  }
  return counts;
}

export function computeSerpSelectorTopDomains(triage, limit) {
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

export function computeSerpSelectorUniqueDomains(triage) {
  const domains = new Set();
  for (const t of triage) {
    for (const c of t.candidates) {
      domains.add(c.domain);
    }
  }
  return domains.size;
}

export function buildSerpSelectorDecisionSegments(counts) {
  const segments = [];
  if (counts.keep > 0) segments.push({ label: 'Keep', value: counts.keep, color: 'sf-metric-fill-success' });
  if (counts.dropped_by_llm > 0) segments.push({ label: 'Dropped by LLM', value: counts.dropped_by_llm, color: 'sf-metric-fill-danger' });
  if (counts.hard_drop > 0) segments.push({ label: 'Hard Dropped', value: counts.hard_drop, color: 'sf-metric-fill-warning' });
  return segments;
}

export function buildSerpSelectorFunnelBullets(triage, calls) {
  if (triage.length === 0 && calls.length === 0) return [];

  const bullets = [];
  const counts = computeSerpSelectorDecisionCounts(triage);
  const totalCandidates = triage.reduce((sum, t) => sum + t.candidates.length, 0);
  const uniqueDomains = computeSerpSelectorUniqueDomains(triage);

  if (totalCandidates > 0) {
    bullets.push(`${totalCandidates} candidate URLs evaluated across ${triage.length} quer${triage.length === 1 ? 'y' : 'ies'}`);
  }

  if (uniqueDomains > 0) {
    bullets.push(`${uniqueDomains} unique domain${uniqueDomains !== 1 ? 's' : ''} represented`);
  }

  const total = counts.keep + counts.dropped_by_llm + counts.hard_drop;
  if (total > 0) {
    const parts = [];
    if (counts.keep > 0) parts.push(`${counts.keep} kept`);
    if (counts.dropped_by_llm > 0) parts.push(`${counts.dropped_by_llm} dropped by LLM`);
    if (counts.hard_drop > 0) parts.push(`${counts.hard_drop} hard-dropped`);
    bullets.push(`Decision: ${parts.join(', ')}`);
  }

  if (calls.length > 0 && calls[0].model) {
    bullets.push(`Scored by ${calls[0].model}`);
  }

  return bullets;
}

export function buildSerpSelectorDomainDecisionBreakdown(triage) {
  const map = new Map();
  for (const t of triage) {
    for (const c of t.candidates) {
      if (!map.has(c.domain)) {
        map.set(c.domain, { keep: 0, dropped_by_llm: 0, hard_drop: 0 });
      }
      const entry = map.get(c.domain);
      if (c.decision === 'keep') entry.keep++;
      else if (c.decision === 'hard_drop') entry.hard_drop++;
      else entry.dropped_by_llm++;
    }
  }
  return map;
}
