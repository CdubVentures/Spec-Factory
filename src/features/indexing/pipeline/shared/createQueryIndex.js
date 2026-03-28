// WHY: Pure aggregation functions for query/URL telemetry indexes.
// Accept pre-fetched rows (from SQL) and return summary objects.
// NDJSON factory removed — pipeline uses SQL callbacks (Wave B1-B4).

export function computeQueryIndexSummary(rows) {
  if (rows.length === 0) return { total: 0, dead_count: 0, top_yield: [], provider_breakdown: {} };

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.query}::${row.provider}`;
    if (!groups.has(key)) groups.set(key, { query: row.query, provider: row.provider, uses: [] });
    groups.get(key).uses.push(row);
  }

  let deadCount = 0;
  const providerMap = {};
  const yieldEntries = [];

  for (const [, g] of groups) {
    const isDead = g.uses.length >= 3 && g.uses.every((u) => !u.field_yield || u.field_yield.length === 0);
    if (isDead) deadCount++;
    const avgYieldLen = g.uses.reduce((s, u) => s + (u.field_yield ? u.field_yield.length : 0), 0) / g.uses.length;
    yieldEntries.push({ query: g.query, provider: g.provider, avg_yield: avgYieldLen });

    if (!providerMap[g.provider]) providerMap[g.provider] = { query_count: 0, total_results: 0, yield_sum: 0, yield_count: 0 };
    const pb = providerMap[g.provider];
    pb.query_count++;
    pb.total_results += g.uses.reduce((s, u) => s + (u.result_count || 0), 0);
    pb.yield_sum += g.uses.reduce((s, u) => s + (u.field_yield ? u.field_yield.length : 0), 0);
    pb.yield_count += g.uses.length;
  }

  yieldEntries.sort((a, b) => b.avg_yield - a.avg_yield);
  const topYield = yieldEntries.map((e) => ({ query: e.query, provider: e.provider, avg_yield: e.avg_yield }));

  const providerBreakdown = {};
  for (const [prov, pb] of Object.entries(providerMap)) {
    providerBreakdown[prov] = {
      query_count: pb.query_count,
      total_results: pb.total_results,
      avg_field_yield: pb.yield_count > 0 ? pb.yield_sum / pb.yield_count : 0,
    };
  }

  return { total: rows.length, dead_count: deadCount, top_yield: topYield, provider_breakdown: providerBreakdown };
}

export function computeUrlIndexSummary(rows) {
  if (rows.length === 0) return { total: 0, reuse_distribution: {}, high_yield: [], tier_breakdown: {} };

  const urlMap = new Map();
  const seenRunIds = new Set();
  for (const row of rows) {
    const dedupeKey = `${row.url}::${row.run_id}`;
    if (seenRunIds.has(dedupeKey)) continue;
    seenRunIds.add(dedupeKey);
    if (!urlMap.has(row.url)) urlMap.set(row.url, { visits: [], fieldSet: new Set(), successCount: 0 });
    const entry = urlMap.get(row.url);
    entry.visits.push(row);
    for (const f of (row.fields_filled || [])) entry.fieldSet.add(f);
    if (row.fetch_success) entry.successCount++;
  }

  const reuseDist = {};
  const highYield = [];
  const tierMap = {};

  for (const [url, entry] of urlMap) {
    const count = entry.visits.length;
    reuseDist[String(count)] = (reuseDist[String(count)] || 0) + 1;
    if (count >= 3 && entry.fieldSet.size >= 5) {
      highYield.push({ url, times_visited: count, fields_filled: [...entry.fieldSet] });
    }
    for (const v of entry.visits) {
      const tier = String(v.tier ?? 'unknown');
      if (!tierMap[tier]) tierMap[tier] = { url_count: 0, total_fields: 0, success_count: 0, visit_count: 0 };
      const tb = tierMap[tier];
      tb.visit_count++;
      tb.total_fields += (v.fields_filled || []).length;
      if (v.fetch_success) tb.success_count++;
    }
  }

  for (const [, entry] of urlMap) {
    const tiers = new Set(entry.visits.map((v) => String(v.tier ?? 'unknown')));
    for (const tier of tiers) {
      if (tierMap[tier]) tierMap[tier].url_count++;
    }
  }

  const tierBreakdown = {};
  for (const [tier, tb] of Object.entries(tierMap)) {
    tierBreakdown[tier] = {
      url_count: tb.url_count,
      total_fields: tb.total_fields,
      avg_success_rate: tb.visit_count > 0 ? tb.success_count / tb.visit_count : 0,
    };
  }

  return { total: rows.length, reuse_distribution: reuseDist, high_yield: highYield, tier_breakdown: tierBreakdown };
}
