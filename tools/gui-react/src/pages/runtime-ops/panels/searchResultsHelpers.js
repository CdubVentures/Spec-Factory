export function computeDecisionCounts(details) {
  const counts = { keep: 0, maybe: 0, drop: 0, other: 0 };
  for (const detail of details) {
    for (const r of detail.results) {
      const d = r.decision;
      if (d === 'keep') counts.keep++;
      else if (d === 'maybe') counts.maybe++;
      else if (d === 'drop') counts.drop++;
      else counts.other++;
    }
  }
  return counts;
}

export function computeTopDomains(details, limit) {
  const map = new Map();
  for (const detail of details) {
    for (const r of detail.results) {
      map.set(r.domain, (map.get(r.domain) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeUniqueUrls(details) {
  const urls = new Set();
  for (const detail of details) {
    for (const r of detail.results) {
      urls.add(r.url);
    }
  }
  return urls.size;
}

export function computeFilteredCount(details) {
  let count = 0;
  for (const detail of details) {
    for (const r of detail.results) {
      if (r.decision === 'drop' || r.decision === 'skip') count++;
    }
  }
  return count;
}

export function buildFunnelBullets(results, details, decisions) {
  if (results.length === 0 && details.length === 0) return [];

  const bullets = [];
  const providers = [...new Set(results.map((r) => providerDisplayLabel(r.provider)).filter(Boolean))];
  const totalRawResults = results.reduce((sum, r) => sum + r.result_count, 0);
  const totalDetailResults = details.reduce((sum, d) => sum + d.results.length, 0);

  if (results.length > 0) {
    const providerPart = providers.length > 0 ? ` across ${providers.join(', ')}` : '';
    bullets.push(`${results.length} queries${providerPart} returned ${totalRawResults} raw results`);
  }

  const totalDeduped = details.reduce((sum, d) => sum + d.dedupe_count, 0);
  if (totalDeduped > 0) {
    bullets.push(`${totalDeduped} duplicate${totalDeduped > 1 ? 's' : ''} removed during dedupe`);
  }

  const total = decisions.keep + decisions.maybe + decisions.drop + decisions.other;
  if (total > 0) {
    const parts = [];
    if (decisions.keep > 0) parts.push(`${decisions.keep} kept`);
    if (decisions.maybe > 0) parts.push(`${decisions.maybe} maybe`);
    if (decisions.drop > 0) parts.push(`${decisions.drop} dropped`);
    bullets.push(`Decision: ${parts.join(', ')}`);
  }

  return bullets;
}

export function buildDecisionSegments(decisions) {
  return [
    { label: 'Keep', value: decisions.keep, color: 'bg-green-500' },
    { label: 'Maybe', value: decisions.maybe, color: 'bg-yellow-500' },
    { label: 'Drop', value: decisions.drop, color: 'bg-red-500' },
  ];
}

export function buildQueryTargetMap(searchPlans) {
  const map = new Map();
  if (!searchPlans) return map;
  for (const plan of searchPlans) {
    if (!plan.query_target_map) continue;
    for (const [query, targets] of Object.entries(plan.query_target_map)) {
      const existing = map.get(query) || [];
      const merged = [...existing];
      for (const t of targets) {
        if (!merged.includes(t)) merged.push(t);
      }
      map.set(query, merged);
    }
  }
  return map;
}

export function queryPassName(query, searchPlans) {
  if (!searchPlans) return undefined;
  for (const plan of searchPlans) {
    if (plan.queries_generated && plan.queries_generated.includes(query)) {
      return plan.pass_name;
    }
  }
  return undefined;
}

export function computePerQueryStats(details) {
  const map = new Map();
  for (const detail of details) {
    let keepCount = 0;
    let maybeCount = 0;
    let dropCount = 0;
    let totalRelevance = 0;
    const domainCounts = new Map();
    for (const r of detail.results) {
      if (r.decision === 'keep') keepCount++;
      else if (r.decision === 'maybe') maybeCount++;
      else if (r.decision === 'drop' || r.decision === 'skip') dropCount++;
      totalRelevance += r.relevance_score || 0;
      domainCounts.set(r.domain, (domainCounts.get(r.domain) || 0) + 1);
    }
    let topDomain = '';
    let topDomainCount = 0;
    for (const [domain, count] of domainCounts) {
      if (count > topDomainCount) {
        topDomain = domain;
        topDomainCount = count;
      }
    }
    const avgRelevance = detail.results.length > 0
      ? totalRelevance / detail.results.length
      : 0;
    map.set(detail.query, { keepCount, maybeCount, dropCount, topDomain, avgRelevance });
  }
  return map;
}

export function computeDomainDecisionBreakdown(details) {
  const map = new Map();
  for (const detail of details) {
    for (const r of detail.results) {
      if (!map.has(r.domain)) {
        map.set(r.domain, { keep: 0, maybe: 0, drop: 0 });
      }
      const entry = map.get(r.domain);
      if (r.decision === 'keep') entry.keep++;
      else if (r.decision === 'maybe') entry.maybe++;
      else if (r.decision === 'drop' || r.decision === 'skip') entry.drop++;
    }
  }
  return map;
}

export function buildEnrichedFunnelBullets(results, details, decisions, searchPlans) {
  if (results.length === 0 && details.length === 0) return [];

  const bullets = [];
  const providers = [...new Set(results.map((r) => providerDisplayLabel(r.provider)).filter(Boolean))];
  const totalRawResults = results.reduce((sum, r) => sum + r.result_count, 0);

  if (results.length > 0) {
    const providerPart = providers.length > 0 ? ` across ${providers.join(', ')}` : '';
    bullets.push(`${results.length} queries${providerPart} returned ${totalRawResults} raw results`);
  }

  const queryTargetMap = buildQueryTargetMap(searchPlans);
  if (queryTargetMap.size > 0) {
    const allTargets = new Set();
    for (const targets of queryTargetMap.values()) {
      for (const t of targets) allTargets.add(t);
    }
    if (allTargets.size > 0) {
      const display = [...allTargets].slice(0, 4).join(', ');
      const suffix = allTargets.size > 4 ? ` (+${allTargets.size - 4} more)` : '';
      bullets.push(`Targeting ${allTargets.size} fields: ${display}${suffix}`);
    }
  }

  const totalDeduped = details.reduce((sum, d) => sum + d.dedupe_count, 0);
  if (totalDeduped > 0) {
    bullets.push(`${totalDeduped} duplicate${totalDeduped > 1 ? 's' : ''} removed during dedupe`);
  }

  const total = decisions.keep + decisions.maybe + decisions.drop + decisions.other;
  if (total > 0) {
    const parts = [];
    if (decisions.keep > 0) parts.push(`${decisions.keep} kept`);
    if (decisions.maybe > 0) parts.push(`${decisions.maybe} maybe`);
    if (decisions.drop > 0) parts.push(`${decisions.drop} dropped`);
    bullets.push(`Decision: ${parts.join(', ')}`);
  }

  if (details.length > 1) {
    let bestQuery = '';
    let bestKeepCount = 0;
    for (const d of details) {
      const keepCount = d.results.filter((r) => r.decision === 'keep').length;
      if (keepCount > bestKeepCount) {
        bestKeepCount = keepCount;
        bestQuery = d.query;
      }
    }
    if (bestQuery && bestKeepCount > 0) {
      bullets.push(`Top-yield query: "${bestQuery}" (${bestKeepCount} kept)`);
    }
  }

  const domainBreakdown = computeDomainDecisionBreakdown(details);
  if (domainBreakdown.size > 0) {
    let strongestDomain = '';
    let strongestKeep = 0;
    for (const [domain, counts] of domainBreakdown) {
      if (counts.keep > strongestKeep) {
        strongestKeep = counts.keep;
        strongestDomain = domain;
      }
    }
    if (strongestDomain && strongestKeep > 0) {
      bullets.push(`Strongest domain: ${strongestDomain} (${strongestKeep} kept)`);
    }
  }

  return bullets;
}

export function parseDomainFromUrl(url) {
  if (!url) return '';
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
}

function stripWww(domain) {
  return domain.startsWith('www.') ? domain.slice(4) : domain;
}

export function enrichResultDomains(details) {
  return details.map((detail) => ({
    ...detail,
    results: detail.results.map((r) => {
      if (r.domain) return r;
      const parsed = stripWww(parseDomainFromUrl(r.url));
      return { ...r, domain: parsed };
    }),
  }));
}

export function extractSiteScope(query) {
  if (!query) return null;
  const match = String(query).match(/site:([^\s]+)/);
  return match ? match[1] : null;
}

function normalizeProfileToken(profile) {
  const token = String(profile || '').trim().toLowerCase();
  if (token === 'fast' || token === 'standard' || token === 'thorough') {
    return token;
  }
  return 'standard';
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function profileCapDefaults(profile) {
  if (profile === 'fast') {
    return {
      domainCapValue: '2',
      domainCapSource: 'fast profile clamp',
      queryCap: 6,
      discoveredCap: 60,
    };
  }
  if (profile === 'thorough') {
    return {
      domainCapValue: '>=8',
      domainCapSource: 'thorough profile floor',
      queryCap: 20,
      discoveredCap: 300,
    };
  }
  return {
    domainCapValue: 'env',
    domainCapSource: 'MAX_PAGES_PER_DOMAIN (default 2)',
    queryCap: 10,
    discoveredCap: 80,
  };
}

export function resolveDomainCapSummary(liveSettings = {}) {
  const profile = normalizeProfileToken(liveSettings?.profile);
  const defaults = profileCapDefaults(profile);
  const maxPagesPerDomain = toPositiveInt(liveSettings?.maxPagesPerDomain, 0);
  const discoveryResultsPerQuery = toPositiveInt(liveSettings?.discoveryResultsPerQuery, defaults.queryCap);
  const discoveryMaxDiscovered = toPositiveInt(liveSettings?.discoveryMaxDiscovered, defaults.discoveredCap);
  const serpTriageMaxUrls = toPositiveInt(liveSettings?.serpTriageMaxUrls, 12);
  const uberMaxUrlsPerDomain = toPositiveInt(liveSettings?.uberMaxUrlsPerDomain, 6);
  const value = maxPagesPerDomain > 0 ? String(maxPagesPerDomain) : defaults.domainCapValue;
  const source = maxPagesPerDomain > 0 ? 'runtime maxPagesPerDomain knob' : defaults.domainCapSource;
  const profileLabel = profile.charAt(0).toUpperCase() + profile.slice(1);
  const tooltip = [
    'Domain cap controls how many pages per host can advance from search into fetch/parse.',
    '',
    `Current profile: ${profileLabel}.`,
    `Current domain cap display: ${value} (${source}).`,
    '',
    'How caps work:',
    '- Fast profile: clamps discovery results/query to 6 and max pages/domain to 2.',
    '- Standard profile: uses configured env/runtime knobs (DISCOVERY_RESULTS_PER_QUERY, MAX_PAGES_PER_DOMAIN).',
    '- Thorough profile: raises floors to at least 20 results/query and at least 8 pages/domain.',
    `- Discovery total cap keeps up to ${discoveryMaxDiscovered} URLs overall (DISCOVERY_MAX_DISCOVERED).`,
    `- SERP triage cap keeps up to ${serpTriageMaxUrls} URLs after triage (SERP_TRIAGE_MAX_URLS).`,
    `- Uber convergence rounds can raise per-domain floor to max(3, UBER_MAX_URLS_PER_DOMAIN=${uberMaxUrlsPerDomain}).`,
    '',
    `Current results/query cap for this profile is ${discoveryResultsPerQuery} before dedupe and triage.`,
  ].join('\n');
  return {
    value,
    tooltip,
    profile,
    queryCap: discoveryResultsPerQuery,
    discoveredCap: discoveryMaxDiscovered,
    triageCap: serpTriageMaxUrls,
    uberDomainFloor: uberMaxUrlsPerDomain,
  };
}

const PROVIDER_LABELS = {
  google: 'Google',
  bing: 'Bing',
  searxng: 'SearXNG',
  duckduckgo: 'DuckDuckGo',
  dual: 'Dual',
  none: '',
};

export function providerDisplayLabel(provider) {
  if (!provider) return '';
  if (provider.includes('+')) {
    return provider.split('+').map((p) => PROVIDER_LABELS[p] ?? p).join(' + ');
  }
  return PROVIDER_LABELS[provider] ?? provider;
}
