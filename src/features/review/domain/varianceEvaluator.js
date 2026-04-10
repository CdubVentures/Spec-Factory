// ── Variance Evaluator ───────────────────────────────────────────────
//
// Pure functions for evaluating whether a product-level value conforms
// to a component DB's variance policy.  Zero external dependencies.
//
// WHY: Strategy map (O(1) scaling) — adding a new policy = add one
// evaluator function + one registry entry. No switch modification.

const SKIP_VALUES = new Set(['', 'n/a', 'n-a', 'null', 'undefined', 'unknown', '-']);

/**
 * Parse a potentially formatted numeric string into a number.
 * Strips commas, whitespace, and trailing units.
 * Returns NaN if not parseable.
 */
function parseNumeric(val) {
  if (val == null) return NaN;
  const s = String(val).trim().replace(/,/g, '').replace(/\s+/g, '');
  // Strip common trailing units (g, ms, dpi, hz, mm, ips, etc.)
  const cleaned = s.replace(/[a-zA-Z%°]+$/, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function isSkipValue(val) {
  if (val == null) return true;
  return SKIP_VALUES.has(String(val).trim().toLowerCase());
}

// ── Policy evaluators ───────────────────────────────────────────────

function evaluateAuthoritative(dbStr, prodStr) {
  const dbNum = parseNumeric(dbStr);
  const prodNum = parseNumeric(prodStr);
  if (!Number.isNaN(dbNum) && !Number.isNaN(prodNum)) {
    if (dbNum === prodNum) return { compliant: true };
    return {
      compliant: false,
      reason: 'authoritative_mismatch',
      details: { expected: dbStr, actual: prodStr, expected_numeric: dbNum, actual_numeric: prodNum },
    };
  }
  if (dbStr.toLowerCase() === prodStr.toLowerCase()) return { compliant: true };
  return {
    compliant: false,
    reason: 'authoritative_mismatch',
    details: { expected: dbStr, actual: prodStr },
  };
}

function evaluateUpperBound(dbStr, prodStr) {
  const dbNum = parseNumeric(dbStr);
  const prodNum = parseNumeric(prodStr);
  if (Number.isNaN(dbNum) || Number.isNaN(prodNum)) {
    return { compliant: true, reason: 'skipped_non_numeric' };
  }
  if (prodNum <= dbNum) return { compliant: true };
  return {
    compliant: false,
    reason: 'exceeds_upper_bound',
    details: { bound: dbNum, actual: prodNum },
  };
}

function evaluateLowerBound(dbStr, prodStr) {
  const dbNum = parseNumeric(dbStr);
  const prodNum = parseNumeric(prodStr);
  if (Number.isNaN(dbNum) || Number.isNaN(prodNum)) {
    return { compliant: true, reason: 'skipped_non_numeric' };
  }
  if (prodNum >= dbNum) return { compliant: true };
  return {
    compliant: false,
    reason: 'below_lower_bound',
    details: { bound: dbNum, actual: prodNum },
  };
}

function evaluateRange(dbStr, prodStr, options) {
  const dbNum = parseNumeric(dbStr);
  const prodNum = parseNumeric(prodStr);
  if (Number.isNaN(dbNum) || Number.isNaN(prodNum)) {
    return { compliant: true, reason: 'skipped_non_numeric' };
  }
  const tolerance = options.tolerance ?? 0.10;
  const margin = Math.abs(dbNum) * tolerance;
  const lo = dbNum - margin;
  const hi = dbNum + margin;
  if (prodNum >= lo && prodNum <= hi) return { compliant: true };
  return {
    compliant: false,
    reason: 'outside_range',
    details: { expected: dbNum, actual: prodNum, tolerance, lo, hi },
  };
}

// ── Strategy registry ───────────────────────────────────────────────

const POLICY_EVALUATORS = {
  authoritative: evaluateAuthoritative,
  upper_bound: evaluateUpperBound,
  lower_bound: evaluateLowerBound,
  range: evaluateRange,
};

/**
 * Evaluate a single product value against a variance policy.
 *
 * @param {string|null} policy  - One of: null, 'override_allowed', 'authoritative', 'upper_bound', 'lower_bound', 'range'
 * @param {*} dbValue           - The component DB's canonical value
 * @param {*} productValue      - The product-level value to check
 * @param {object} [options]
 * @param {number} [options.tolerance=0.10] - Fractional tolerance for 'range' policy (default 10%)
 * @returns {{ compliant: boolean, reason?: string, details?: object }}
 */
export function evaluateVariance(policy, dbValue, productValue, options = {}) {
  if (!policy || policy === 'override_allowed') {
    return { compliant: true };
  }

  if (isSkipValue(dbValue) || isSkipValue(productValue)) {
    return { compliant: true, reason: 'skipped_missing_value' };
  }

  const dbStr = String(dbValue).trim();
  const prodStr = String(productValue).trim();

  const evaluator = POLICY_EVALUATORS[policy];
  if (!evaluator) return { compliant: true, reason: 'unknown_policy' };
  return evaluator(dbStr, prodStr, options);
}

/**
 * Evaluate a batch of product entries against a variance policy.
 *
 * @param {string|null} policy
 * @param {*} dbValue
 * @param {Array<{ product_id: string, value: * }>} productEntries
 * @param {object} [options]
 * @returns {{ summary: { total: number, compliant: number, violations: number }, results: Array }}
 */
export function evaluateVarianceBatch(policy, dbValue, productEntries, options = {}) {
  const results = [];
  let compliantCount = 0;
  let violationCount = 0;

  for (const entry of productEntries) {
    const result = evaluateVariance(policy, dbValue, entry.value, options);
    results.push({ product_id: entry.product_id, value: entry.value, ...result });
    if (result.compliant) {
      compliantCount++;
    } else {
      violationCount++;
    }
  }

  return {
    summary: { total: productEntries.length, compliant: compliantCount, violations: violationCount },
    results,
  };
}
