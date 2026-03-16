// WHY: Computes compound learning curves across runs — tracks whether
// search volume decreases and URL reuse increases over time, proving
// that the indexing system learns from prior runs.

import fs from 'node:fs';

/**
 * Read NDJSON lines from path, returning parsed rows (skipping malformed).
 */
function readNdjsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

/**
 * Simple linear slope of a numeric series.
 * Returns slope per index (per run).
 */
function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Compute compound learning curve across runs.
 *
 * @param {{ category: string, runSummaries: object[], queryIndexPath: string, urlIndexPath: string }} opts
 * @returns {CompoundCurveResult}
 */
export function computeCompoundCurve({ category, runSummaries, queryIndexPath, urlIndexPath }) {
  const runs = Array.isArray(runSummaries) ? runSummaries : [];

  if (runs.length === 0) {
    return {
      category,
      verdict: 'NOT_PROVEN',
      search_reduction_pct: 0,
      url_reuse_trend: 'flat',
      runs: [],
    };
  }

  // Read NDJSON indexes
  const queryRows = readNdjsonLines(queryIndexPath);
  const urlRows = readNdjsonLines(urlIndexPath);

  // Group queries by run_id
  const queriesByRun = new Map();
  for (const row of queryRows) {
    const rid = String(row.run_id || '');
    if (!queriesByRun.has(rid)) queriesByRun.set(rid, []);
    queriesByRun.get(rid).push(row);
  }

  // Group URLs by run_id
  const urlsByRun = new Map();
  for (const row of urlRows) {
    const rid = String(row.run_id || '');
    if (!urlsByRun.has(rid)) urlsByRun.set(rid, []);
    urlsByRun.get(rid).push(row);
  }

  // Track URLs seen across all prior runs for reuse calculation
  const priorUrls = new Set();
  const runResults = [];

  for (const run of runs) {
    const rid = String(run.run_id || '');
    const counters = run.counters ?? {};
    const filled = Number(counters.fields_filled) || 0;
    const total = Number(counters.fields_total) || 0;

    // Searches for this run
    const searches = (queriesByRun.get(rid) || []).length;

    // URLs for this run
    const runUrls = (urlsByRun.get(rid) || []);
    const runUrlSet = new Set(runUrls.map((r) => String(r.url || '')).filter(Boolean));
    const totalUrls = runUrlSet.size;

    // Reuse = URLs in this run that were seen in prior runs
    let reusedCount = 0;
    for (const url of runUrlSet) {
      if (priorUrls.has(url)) reusedCount++;
    }
    const urlReusePct = totalUrls > 0 ? (reusedCount / totalUrls) * 100 : 0;
    const newUrls = totalUrls - reusedCount;

    // Add this run's URLs to prior set for next iteration
    for (const url of runUrlSet) priorUrls.add(url);

    const fillRatePct = total > 0 ? (filled / total) * 100 : 0;

    runResults.push({
      run_id: rid,
      searches,
      url_reuse_pct: Math.round(urlReusePct * 100) / 100,
      new_urls: newUrls,
      fill_rate_pct: Math.round(fillRatePct * 100) / 100,
    });
  }

  // Compute search reduction: (first run searches - last run searches) / first run searches * 100
  const firstSearches = runResults[0]?.searches || 0;
  const lastSearches = runResults[runResults.length - 1]?.searches || 0;
  const searchReductionPct = firstSearches > 0
    ? Math.round(((firstSearches - lastSearches) / firstSearches) * 100 * 100) / 100
    : 0;

  // URL reuse trend via linear slope
  const reuseSeries = runResults.map((r) => r.url_reuse_pct);
  const slope = linearSlope(reuseSeries);
  let urlReuseTrend;
  if (slope > 1.0) urlReuseTrend = 'increasing';
  else if (slope < -1.0) urlReuseTrend = 'decreasing';
  else urlReuseTrend = 'flat';

  // Verdict
  let verdict;
  if (searchReductionPct >= 30 && urlReuseTrend === 'increasing') {
    verdict = 'PROVEN';
  } else if (searchReductionPct >= 10 || urlReuseTrend === 'increasing') {
    verdict = 'PARTIAL';
  } else {
    verdict = 'NOT_PROVEN';
  }

  return {
    category,
    verdict,
    search_reduction_pct: searchReductionPct,
    url_reuse_trend: urlReuseTrend,
    runs: runResults,
  };
}
