/**
 * Pure metrics computation for product run history.
 * No side effects — takes raw rows, returns aggregate metrics.
 *
 * @param {{ runs: Array, queries: Array, urls: Array }} data
 * @returns {object} Aggregate metrics object
 */
export function computeProductHistoryMetrics({ runs = [], queries = [], urls = [] }) {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'completed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;

  const totalCost = runs.reduce((sum, r) => sum + (Number(r.cost_usd_run) || 0), 0);
  const avgCost = totalRuns > 0 ? totalCost / totalRuns : 0;

  const totalQueries = queries.length;
  const uniqueQueries = new Set(queries.map((q) => q.query)).size;

  const totalUrls = urls.length;
  const urlsSuccess = urls.filter((u) => Boolean(u.fetch_success)).length;
  const urlsFailed = totalUrls - urlsSuccess;
  const uniqueHosts = new Set(urls.map((u) => u.host)).size;

  return {
    total_runs: totalRuns,
    completed_runs: completedRuns,
    failed_runs: failedRuns,
    total_cost_usd: round2(totalCost),
    avg_cost_per_run: round2(avgCost),
    total_queries: totalQueries,
    unique_queries: uniqueQueries,
    total_urls: totalUrls,
    urls_success: urlsSuccess,
    urls_failed: urlsFailed,
    unique_hosts: uniqueHosts,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
