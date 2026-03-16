// WHY: Aggregates cross-run metrics from run summaries into sparkline-ready
// data for trending fill rate, search volume, and block rate across runs.

/**
 * Aggregate cross-run metrics from a list of run summaries.
 *
 * @param {{ category: string, runSummaries: object[] }} opts
 * @returns {CrossRunMetricsResult}
 */
export function aggregateCrossRunMetrics({ category, runSummaries }) {
  const runs = Array.isArray(runSummaries) ? [...runSummaries] : [];

  if (runs.length === 0) {
    return {
      category,
      run_count: 0,
      field_fill_rate: 0,
      searches_per_product: 0,
      block_rate_by_host: {},
      sparkline_data: { fill_rate: [], searches: [], block_rate: [] },
    };
  }

  // Sort chronologically by started_at
  runs.sort((a, b) => {
    const ta = String(a.started_at || '');
    const tb = String(b.started_at || '');
    return ta.localeCompare(tb);
  });

  const fillRates = [];
  const searches = [];
  const blockRates = [];

  for (const run of runs) {
    const c = run.counters ?? {};
    const filled = Number(c.fields_filled) || 0;
    const total = Number(c.fields_total) || 0;
    const ok = Number(c.fetched_ok) || 0;
    const blocked = Number(c.fetched_blocked) || 0;
    const errored = Number(c.fetched_error) || 0;
    const pagesChecked = Number(c.pages_checked) || 0;

    const fillRate = total > 0 ? (filled / total) * 100 : 0;
    const totalFetches = ok + blocked + errored;
    const blockRate = totalFetches > 0 ? (blocked / totalFetches) * 100 : 0;

    fillRates.push(Math.round(fillRate * 100) / 100);
    searches.push(pagesChecked);
    blockRates.push(Math.round(blockRate * 100) / 100);
  }

  // Latest run values
  const latest = runs[runs.length - 1];
  const latestCounters = latest.counters ?? {};
  const latestFilled = Number(latestCounters.fields_filled) || 0;
  const latestTotal = Number(latestCounters.fields_total) || 0;
  const latestPages = Number(latestCounters.pages_checked) || 0;

  return {
    category,
    run_count: runs.length,
    field_fill_rate: latestTotal > 0 ? Math.round((latestFilled / latestTotal) * 100 * 100) / 100 : 0,
    searches_per_product: latestPages,
    block_rate_by_host: {},
    sparkline_data: {
      fill_rate: fillRates,
      searches,
      block_rate: blockRates,
    },
  };
}
