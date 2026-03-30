// WHY: Aggregates per-host health status from URL index rows
// (block rate, avg fields per fetch) to surface problematic hosts.

/**
 * Aggregate host health from URL index rows.
 *
 * Status thresholds: blocked ≥0.8, degraded ≥0.2, cooldown ≥0.1, healthy <0.1
 *
 * @param {{ category: string, urlRows: object[] }} opts
 * @returns {HostHealthRow[]}
 */
export function aggregateHostHealth({ category, urlRows }) {
  const rows = urlRows || [];

  const hostMap = new Map();

  for (const row of rows) {
    const host = String(row?.host || '').trim();
    if (!host) continue;

    if (!hostMap.has(host)) {
      hostMap.set(host, { total: 0, failed: 0, totalFields: 0 });
    }
    const entry = hostMap.get(host);
    entry.total++;
    if (!row.fetch_success) entry.failed++;
    const fields = Array.isArray(row.fields_filled) ? row.fields_filled.length : 0;
    entry.totalFields += fields;
  }

  const results = [];

  for (const [host, entry] of hostMap) {
    const blockRate = entry.total > 0 ? entry.failed / entry.total : 0;
    let status;
    if (blockRate >= 0.8) status = 'blocked';
    else if (blockRate >= 0.2) status = 'degraded';
    else if (blockRate >= 0.1) status = 'cooldown';
    else status = 'healthy';

    const avgFieldsPerFetch = entry.total > 0
      ? Math.round((entry.totalFields / entry.total) * 100) / 100
      : 0;

    results.push({
      host,
      total: entry.total,
      failed: entry.failed,
      block_rate: Math.round(blockRate * 100) / 100,
      status,
      avg_fields_per_fetch: avgFieldsPerFetch,
    });
  }

  // Sort by block_rate DESC
  results.sort((a, b) => b.block_rate - a.block_rate);

  return results;
}
