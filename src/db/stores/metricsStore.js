// WHY: Store module for the `metrics` table — runtime telemetry
// (counters, gauges, timings) that replaces _runtime/metrics.jsonl (Wave 4).

export function createMetricsStore({ db, stmts }) {

  function insertMetric(entry) {
    stmts._insertMetric.run({
      ts: entry.ts || new Date().toISOString(),
      metric_type: entry.metric_type || 'gauge',
      name: entry.name || 'unknown',
      value: Number.isFinite(entry.value) ? entry.value : 0,
      labels: typeof entry.labels === 'object' ? JSON.stringify(entry.labels) : (entry.labels || '{}'),
    });
  }

  function insertMetricsBatch(entries) {
    const tx = db.transaction((items) => {
      for (const entry of items) { insertMetric(entry); }
    });
    tx(entries);
  }

  return { insertMetric, insertMetricsBatch };
}
