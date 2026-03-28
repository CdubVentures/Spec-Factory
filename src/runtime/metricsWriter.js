/**
 * Runtime metrics writer — SQL only.
 *
 * Buffers timestamped metrics and flushes to specDb.insertMetric().
 * Each row: { ts, metric, type, value, labels }
 */

function sanitizeMetricName(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

export class MetricsWriter {
  constructor({ specDb = null, defaultLabels = {} } = {}) {
    this.specDb = specDb || null;
    this.defaultLabels = defaultLabels && typeof defaultLabels === 'object' ? defaultLabels : {};
    this._buffer = [];
    this._flushSize = 20;
  }

  _makeRow({ metric, type, value, labels = {} }) {
    return {
      ts: new Date().toISOString(),
      metric: sanitizeMetricName(metric),
      type: type || 'gauge',
      value: Number.isFinite(value) ? value : 0,
      labels: {
        ...this.defaultLabels,
        ...(labels && typeof labels === 'object' ? labels : {})
      }
    };
  }

  async _appendRow(row) {
    this._buffer.push(row);
    if (this._buffer.length >= this._flushSize) {
      await this.flush();
    }
  }

  async counter(metric, value = 1, labels = {}) {
    await this._appendRow(this._makeRow({ metric, type: 'counter', value, labels }));
  }

  async gauge(metric, value, labels = {}) {
    await this._appendRow(this._makeRow({ metric, type: 'gauge', value, labels }));
  }

  async timing(metric, durationMs, labels = {}) {
    await this._appendRow(this._makeRow({ metric, type: 'timing', value: durationMs, labels }));
  }

  async flush() {
    if (this._buffer.length === 0) return;
    if (this.specDb) {
      for (const row of this._buffer) {
        try {
          this.specDb.insertMetric({
            ts: row.ts,
            metric_type: row.type,
            name: row.metric,
            value: row.value,
            labels: JSON.stringify(row.labels || {}),
          });
        } catch { /* best-effort — metrics must not crash the pipeline */ }
      }
    }
    this._buffer = [];
  }

  snapshot() {
    return {
      buffered: this._buffer.length,
      default_labels: { ...this.defaultLabels }
    };
  }
}
