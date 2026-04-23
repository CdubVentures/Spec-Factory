/**
 * Project evaluator buckets to a minimal WS payload shape so the operations
 * sidebar can render per-candidate pill chips during loop runs. Pure function —
 * no DB, no I/O, safe to call every iteration.
 *
 * Input: evaluateFieldBuckets's `buckets[]` array (same shape each bucket exposes).
 * Output: `[{ fp, label, count, required, qualifies, topConf }]` — tiny, display-only.
 *
 * Caps at 7 entries + a trailing `__more__` chip so the sidebar (~244px wide)
 * doesn't grow unbounded when a field has many competing values.
 */

const MAX_BUCKETS = 7;
const LABEL_MAX = 24;

function serializeLabel(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const inner = value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    return `[${inner}]`;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(label) {
  if (label.length <= LABEL_MAX) return label;
  return `${label.slice(0, LABEL_MAX)}…`;
}

function normalizeTopConf(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return Math.round(n * 100);
  return Math.round(n);
}

export function projectBucketsForProgress(buckets, opts) {
  if (!Array.isArray(buckets) || buckets.length === 0) return [];
  const required = Number.isFinite(opts?.required) ? Math.max(0, Math.floor(opts.required)) : 0;

  const projected = buckets.slice(0, MAX_BUCKETS).map(b => ({
    fp: String(b?.value_fingerprint ?? ''),
    label: truncate(serializeLabel(b?.value)),
    count: Number(b?.pooledCount ?? 0),
    required,
    qualifies: Boolean(b?.qualifies),
    topConf: normalizeTopConf(b?.top_confidence),
  }));

  if (buckets.length > MAX_BUCKETS) {
    projected.push({
      fp: '__more__',
      label: `+${buckets.length - MAX_BUCKETS} more`,
      count: 0,
      required: 0,
      qualifies: false,
      topConf: null,
    });
  }

  return projected;
}
