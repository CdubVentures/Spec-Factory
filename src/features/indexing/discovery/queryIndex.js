// WHY: Cross-run query and URL indexes. Collected during shadow mode
// to prove v2 improvements compound. NDJSON storage — portable, no new deps.

import fs from 'node:fs';

/**
 * Append a query result record to the NDJSON log.
 */
export function recordQueryResult(record, logPath) {
  const line = JSON.stringify({
    query: record.query ?? null,
    provider: record.provider ?? null,
    result_count: record.result_count ?? 0,
    field_yield: record.field_yield ?? null,
    run_id: record.run_id ?? null,
    category: record.category ?? null,
    product_id: record.product_id ?? null,
    ts: new Date().toISOString(),
  });
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

/**
 * Look up query history from the NDJSON log.
 */
export function lookupQueryHistory(query, provider, logPath) {
  if (!fs.existsSync(logPath)) {
    return { times_used: 0, avg_result_count: 0, fields_attributed: [] };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const matches = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.query === query && row.provider === provider) {
        matches.push(row);
      }
    } catch { /* skip malformed */ }
  }

  if (matches.length === 0) {
    return { times_used: 0, avg_result_count: 0, fields_attributed: [] };
  }

  const totalResults = matches.reduce((sum, m) => sum + (m.result_count || 0), 0);
  const fieldSet = new Set();
  for (const m of matches) {
    for (const f of (m.field_yield || [])) fieldSet.add(f);
  }

  return {
    times_used: matches.length,
    avg_result_count: totalResults / matches.length,
    fields_attributed: [...fieldSet],
  };
}

/**
 * Append a URL visit record to the NDJSON log.
 */
export function recordUrlVisit(record, logPath) {
  const line = JSON.stringify({
    url: record.url ?? null,
    host: record.host ?? null,
    tier: record.tier ?? null,
    doc_kind: record.doc_kind ?? null,
    fields_filled: record.fields_filled ?? [],
    fetch_success: record.fetch_success ?? false,
    run_id: record.run_id ?? null,
    ts: new Date().toISOString(),
  });
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

/**
 * Look up URL visit history from the NDJSON log.
 */
export function lookupUrlHistory(url, logPath) {
  if (!fs.existsSync(logPath)) {
    return { times_visited: 0, last_seen: null, fields_filled: [], avg_fetch_success_rate: 0 };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const matches = [];
  const seenRunIds = new Set();

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.url === url) {
        // Deduplicate within same run_id
        const dedupeKey = `${row.url}::${row.run_id}`;
        if (seenRunIds.has(dedupeKey)) continue;
        seenRunIds.add(dedupeKey);
        matches.push(row);
      }
    } catch { /* skip malformed */ }
  }

  if (matches.length === 0) {
    return { times_visited: 0, last_seen: null, fields_filled: [], avg_fetch_success_rate: 0 };
  }

  const fieldSet = new Set();
  let successCount = 0;
  let lastSeen = null;

  for (const m of matches) {
    for (const f of (m.fields_filled || [])) fieldSet.add(f);
    if (m.fetch_success) successCount++;
    if (!lastSeen || (m.ts && m.ts > lastSeen)) lastSeen = m.ts;
  }

  return {
    times_visited: matches.length,
    last_seen: lastSeen,
    fields_filled: [...fieldSet],
    avg_fetch_success_rate: successCount / matches.length,
  };
}

/**
 * Dead query = used >= 3 times AND every use has null/empty field_yield.
 */
export function isDeadQuery(query, provider, logPath) {
  if (!fs.existsSync(logPath)) return false;
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const matches = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.query === query && row.provider === provider) matches.push(row);
    } catch { /* skip malformed */ }
  }
  if (matches.length < 3) return false;
  return matches.every((m) => !m.field_yield || m.field_yield.length === 0);
}

/**
 * Single-pass query log summary.
 */
export function queryIndexSummary(logPath) {
  if (!fs.existsSync(logPath)) {
    return { total: 0, dead_count: 0, top_yield: [], provider_breakdown: {} };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const groups = new Map(); // key: `${query}::${provider}`
  let total = 0;

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      total++;
      const key = `${row.query}::${row.provider}`;
      if (!groups.has(key)) {
        groups.set(key, { query: row.query, provider: row.provider, uses: [] });
      }
      groups.get(key).uses.push(row);
    } catch { /* skip malformed */ }
  }

  let deadCount = 0;
  const providerMap = {};
  const yieldEntries = [];

  for (const [, g] of groups) {
    const isDead = g.uses.length >= 3 &&
      g.uses.every((u) => !u.field_yield || u.field_yield.length === 0);
    if (isDead) deadCount++;

    const totalResults = g.uses.reduce((s, u) => s + (u.result_count || 0), 0);
    const avgYieldLen = g.uses.reduce((s, u) => s + (u.field_yield ? u.field_yield.length : 0), 0) / g.uses.length;

    yieldEntries.push({ query: g.query, provider: g.provider, avg_yield: avgYieldLen });

    if (!providerMap[g.provider]) {
      providerMap[g.provider] = { query_count: 0, total_results: 0, yield_sum: 0, yield_count: 0 };
    }
    const pb = providerMap[g.provider];
    pb.query_count++;
    pb.total_results += totalResults;
    pb.yield_sum += g.uses.reduce((s, u) => s + (u.field_yield ? u.field_yield.length : 0), 0);
    pb.yield_count += g.uses.length;
  }

  yieldEntries.sort((a, b) => b.avg_yield - a.avg_yield);
  const topYield = yieldEntries.slice(0, 10).map((e) => ({
    query: e.query, provider: e.provider, avg_yield: e.avg_yield
  }));

  const providerBreakdown = {};
  for (const [prov, pb] of Object.entries(providerMap)) {
    providerBreakdown[prov] = {
      query_count: pb.query_count,
      total_results: pb.total_results,
      avg_field_yield: pb.yield_count > 0 ? pb.yield_sum / pb.yield_count : 0
    };
  }

  return { total, dead_count: deadCount, top_yield: topYield, provider_breakdown: providerBreakdown };
}

/**
 * URL index summary — reuse distribution, high-yield URLs, tier breakdown.
 */
export function urlIndexSummary(logPath) {
  if (!fs.existsSync(logPath)) {
    return { total: 0, reuse_distribution: {}, high_yield: [], tier_breakdown: {} };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const urlMap = new Map();
  const seenRunIds = new Set();
  let total = 0;

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      total++;
      const dedupeKey = `${row.url}::${row.run_id}`;
      if (seenRunIds.has(dedupeKey)) continue;
      seenRunIds.add(dedupeKey);

      if (!urlMap.has(row.url)) {
        urlMap.set(row.url, { visits: [], fieldSet: new Set(), successCount: 0 });
      }
      const entry = urlMap.get(row.url);
      entry.visits.push(row);
      for (const f of (row.fields_filled || [])) entry.fieldSet.add(f);
      if (row.fetch_success) entry.successCount++;
    } catch { /* skip malformed */ }
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
      if (!tierMap[tier]) {
        tierMap[tier] = { url_count: 0, total_fields: 0, success_count: 0, visit_count: 0 };
      }
      const tb = tierMap[tier];
      tb.visit_count++;
      tb.total_fields += (v.fields_filled || []).length;
      if (v.fetch_success) tb.success_count++;
    }
  }

  // Count unique URLs per tier
  for (const [url, entry] of urlMap) {
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
      avg_success_rate: tb.visit_count > 0 ? tb.success_count / tb.visit_count : 0
    };
  }

  return { total, reuse_distribution: reuseDist, high_yield: highYield, tier_breakdown: tierBreakdown };
}

/**
 * Return URL strings where times_visited >= threshold AND avg_fetch_success_rate > 0.5.
 */
export function highYieldUrls(logPath, threshold = 3) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const urlMap = new Map();
  const seenRunIds = new Set();

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const dedupeKey = `${row.url}::${row.run_id}`;
      if (seenRunIds.has(dedupeKey)) continue;
      seenRunIds.add(dedupeKey);

      if (!urlMap.has(row.url)) {
        urlMap.set(row.url, { count: 0, successCount: 0 });
      }
      const entry = urlMap.get(row.url);
      entry.count++;
      if (row.fetch_success) entry.successCount++;
    } catch { /* skip malformed */ }
  }

  const results = [];
  for (const [url, entry] of urlMap) {
    if (entry.count >= threshold && entry.successCount / entry.count > 0.5) {
      results.push(url);
    }
  }
  return results;
}
