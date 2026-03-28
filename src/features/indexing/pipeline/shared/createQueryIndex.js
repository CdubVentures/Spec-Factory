// WHY: Factory with in-memory cache for query/URL NDJSON indexes.
// Cache invalidated on every record* call. Single-threaded, append-only files.
// Pure aggregation functions exported separately for SQL-backed callers.

import fs from 'node:fs';

// ── Pure aggregation (no I/O — accepts pre-fetched rows) ──

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

function parseLines(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const rows = [];
  for (const line of fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)) {
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

export function createQueryIndex() {
  const _cache = new Map();

  function getCachedLines(logPath) {
    if (_cache.has(logPath)) return _cache.get(logPath);
    const rows = parseLines(logPath);
    _cache.set(logPath, rows);
    return rows;
  }

  function invalidate(logPath) {
    _cache.delete(logPath);
  }

  function recordQueryResult(record, logPath) {
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
    invalidate(logPath);
  }

  function lookupQueryHistory(query, provider, logPath) {
    const rows = getCachedLines(logPath);
    const matches = rows.filter((r) => r.query === query && r.provider === provider);
    if (matches.length === 0) return { times_used: 0, avg_result_count: 0, fields_attributed: [] };

    const totalResults = matches.reduce((s, m) => s + (m.result_count || 0), 0);
    const fieldSet = new Set();
    for (const m of matches) for (const f of (m.field_yield || [])) fieldSet.add(f);

    return {
      times_used: matches.length,
      avg_result_count: totalResults / matches.length,
      fields_attributed: [...fieldSet],
    };
  }

  function recordUrlVisit(record, logPath) {
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
    invalidate(logPath);
  }

  function lookupUrlHistory(url, logPath) {
    const rows = getCachedLines(logPath);
    const matches = [];
    const seenRunIds = new Set();
    for (const row of rows) {
      if (row.url !== url) continue;
      const dedupeKey = `${row.url}::${row.run_id}`;
      if (seenRunIds.has(dedupeKey)) continue;
      seenRunIds.add(dedupeKey);
      matches.push(row);
    }
    if (matches.length === 0) return { times_visited: 0, last_seen: null, fields_filled: [], avg_fetch_success_rate: 0 };

    const fieldSet = new Set();
    let successCount = 0;
    let lastSeen = null;
    for (const m of matches) {
      for (const f of (m.fields_filled || [])) fieldSet.add(f);
      if (m.fetch_success) successCount++;
      if (!lastSeen || (m.ts && m.ts > lastSeen)) lastSeen = m.ts;
    }
    return { times_visited: matches.length, last_seen: lastSeen, fields_filled: [...fieldSet], avg_fetch_success_rate: successCount / matches.length };
  }

  function isDeadQuery(query, provider, logPath) {
    const rows = getCachedLines(logPath);
    const matches = rows.filter((r) => r.query === query && r.provider === provider);
    if (matches.length < 3) return false;
    return matches.every((m) => !m.field_yield || m.field_yield.length === 0);
  }

  function queryIndexSummary(logPath) {
    return computeQueryIndexSummary(getCachedLines(logPath));
  }

  function urlIndexSummary(logPath) {
    return computeUrlIndexSummary(getCachedLines(logPath));
  }

  function highYieldUrls(logPath, threshold = 3) {
    const rows = getCachedLines(logPath);
    if (rows.length === 0) return [];

    const urlMap = new Map();
    const seenRunIds = new Set();
    for (const row of rows) {
      const dedupeKey = `${row.url}::${row.run_id}`;
      if (seenRunIds.has(dedupeKey)) continue;
      seenRunIds.add(dedupeKey);
      if (!urlMap.has(row.url)) urlMap.set(row.url, { count: 0, successCount: 0 });
      const entry = urlMap.get(row.url);
      entry.count++;
      if (row.fetch_success) entry.successCount++;
    }

    const results = [];
    for (const [url, entry] of urlMap) {
      if (entry.count >= threshold && entry.successCount / entry.count > 0.5) results.push(url);
    }
    return results;
  }

  return {
    recordQueryResult,
    lookupQueryHistory,
    recordUrlVisit,
    lookupUrlHistory,
    isDeadQuery,
    queryIndexSummary,
    urlIndexSummary,
    highYieldUrls,
  };
}
