/**
 * Compute aggregate metrics across all runs for a product.
 * Runs are enriched with funnel data from extractRunFunnelSummary.
 *
 * @param {{ runs: Array, urls: Array }} data
 * @returns {object} Aggregate metrics
 */
export function computeProductHistoryMetrics({ runs = [], urls = [] }) {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'completed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;

  const totalCost = runs.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const avgCost = totalRuns > 0 ? totalCost / totalRuns : 0;

  const totalDurationMs = runs.reduce((sum, r) => {
    if (!r.started_at || !r.ended_at) return sum;
    return sum + (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime());
  }, 0);
  const avgDurationMs = totalRuns > 0 ? Math.round(totalDurationMs / totalRuns) : 0;

  const totalQueries = runs.reduce((sum, r) => sum + (r.funnel?.queries_executed || 0), 0);

  const totalUrls = urls.length;
  const urlsSuccess = urls.filter((u) => {
    const status = Number(u.http_status) || 0;
    return status >= 200 && status < 400;
  }).length;
  const urlsFailed = totalUrls - urlsSuccess;
  const uniqueHosts = new Set(urls.map((u) => u.host)).size;

  return {
    total_runs: totalRuns,
    completed_runs: completedRuns,
    failed_runs: failedRuns,
    total_cost_usd: round4(totalCost),
    avg_cost_per_run: round4(avgCost),
    avg_duration_ms: avgDurationMs,
    total_queries: totalQueries,
    total_urls: totalUrls,
    urls_success: urlsSuccess,
    urls_failed: urlsFailed,
    unique_hosts: uniqueHosts,
  };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
