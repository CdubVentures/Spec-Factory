/**
 * Pure enum pattern analysis.
 *
 * Given a list of enum values (strings), groups them by structural signature
 * — digit runs collapse to `<N>`, decimals to `<FLOAT>` — so a reviewer can
 * see at a glance whether the enum follows a consistent shape (e.g.
 * `<N> zone (rgb)` / `<N> zone (led)` / `none` for the mouse `lighting` enum)
 * or is freeform.
 *
 * Also flags suspicious values that a human would want to investigate:
 * length ≤ 2, pure numeric strings in a categorical enum, values made of
 * only punctuation.
 *
 * No suggestions, no verdicts — pure detection. The auditor judges.
 *
 * Single export:
 *   - analyzeEnum(values, { contractType? }) → AnalysisResult
 */

const SIGNATURE_FLOAT_RE = /\d+\.\d+/g;
const SIGNATURE_INT_RE = /\d+/g;

/**
 * Collapse digit runs so structurally-identical values share a signature.
 * "1 zone (rgb)" and "9 zone (rgb)" both become "<N> zone (rgb)".
 */
function computeSignature(value) {
  return String(value)
    .replace(SIGNATURE_FLOAT_RE, '<FLOAT>')
    .replace(SIGNATURE_INT_RE, '<N>');
}

function isSuspicious(value) {
  const v = String(value);
  const trimmed = v.trim();
  if (trimmed.length === 0) return { suspicious: true, reason: 'empty' };
  if (trimmed.length <= 2) return { suspicious: true, reason: `very short (${trimmed.length} chars)` };
  if (/^\d+(\.\d+)?$/.test(trimmed)) return { suspicious: true, reason: 'purely numeric in categorical enum' };
  if (!/[A-Za-z]/.test(trimmed)) return { suspicious: true, reason: 'no letters' };
  return { suspicious: false, reason: '' };
}

/**
 * @param {string[]} values
 * @param {object} [opts]
 * @param {string} [opts.contractType]  // 'string' | 'number' | 'integer' | 'boolean' | 'date'
 * @returns {{
 *   total: number,
 *   signatureGroups: Array<{ signature: string, count: number, values: string[] }>,
 *   topSignature: { signature: string, count: number, coveragePct: number } | null,
 *   suspiciousValues: Array<{ value: string, reason: string }>,
 *   filterUi: 'toggles' | 'range' | 'date_range' | 'checkbox' | 'none',
 * }}
 */
export function analyzeEnum(values, { contractType = 'string' } = {}) {
  const list = Array.isArray(values) ? values.map((v) => String(v)) : [];
  const total = list.length;
  const filterUi = resolveFilterUi(contractType);

  const bySignature = new Map();
  for (const v of list) {
    const sig = computeSignature(v);
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig).push(v);
  }
  const signatureGroups = Array.from(bySignature.entries())
    .map(([signature, vals]) => ({ signature, count: vals.length, values: vals }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));

  const topSignature = signatureGroups.length > 0 && total > 0
    ? {
        signature: signatureGroups[0].signature,
        count: signatureGroups[0].count,
        coveragePct: Math.round((signatureGroups[0].count / total) * 100),
      }
    : null;

  const suspiciousValues = [];
  if (contractType === 'string') {
    for (const v of list) {
      const check = isSuspicious(v);
      if (check.suspicious) suspiciousValues.push({ value: v, reason: check.reason });
    }
  }

  return { total, signatureGroups, topSignature, suspiciousValues, filterUi };
}

/**
 * Contract: type+shape → frontend filter rendering.
 * string → toggle chip list (one chip per enum value)
 * number/integer → range bar (min/max)
 * date → date range picker
 * boolean → single checkbox
 * otherwise → none
 */
export function resolveFilterUi(contractType) {
  const t = String(contractType || '').toLowerCase();
  if (t === 'number' || t === 'integer' || t === 'int' || t === 'float') return 'range';
  if (t === 'date') return 'date_range';
  if (t === 'boolean' || t === 'bool') return 'checkbox';
  if (t === 'string') return 'toggles';
  return 'none';
}
