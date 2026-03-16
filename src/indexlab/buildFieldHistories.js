// WHY: After each pipeline round, we need to build per-field history
// so the next round's NeedSet (Schema 1) carries memory of what was tried.
// Without this, the planner has no anti-garbage data and repeats searches.

const UNKNOWN_VALUE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined']);

const BENCHMARK_HOST_PATTERNS = /benchmark|versus|compare|cpuboss|gpuboss|userbenchmark/i;
const SUPPORT_HOST_PATTERNS = /^support\.|\/support\b/i;

/**
 * Classify a rootDomain/host into a HostClass enum.
 * Uses tier, tierName, and host patterns from evidence metadata.
 *
 * @param {object|null} evidence - { tier, tierName, host, url }
 * @returns {"official"|"support"|"review"|"benchmark"|"retailer"|"database"|"community"|"fallback"}
 */
export function classifyHostClass(evidence) {
  if (!evidence || typeof evidence !== 'object') return 'fallback';

  const tier = Number(evidence.tier) || 0;
  const tierName = String(evidence.tierName || '').toLowerCase();
  const host = String(evidence.host || '').toLowerCase();
  const url = String(evidence.url || '').toLowerCase();

  if (tier === 1 || tierName === 'manufacturer') {
    if (SUPPORT_HOST_PATTERNS.test(host) || SUPPORT_HOST_PATTERNS.test(url)) {
      return 'support';
    }
    return 'official';
  }

  if (tierName === 'review') return 'review';
  if (tierName === 'retailer') return 'retailer';

  if (tier === 2) {
    if (BENCHMARK_HOST_PATTERNS.test(host)) return 'benchmark';
    return 'database';
  }

  if (tier === 3) return 'community';

  return 'fallback';
}

/**
 * Classify evidence into an EvidenceClass enum.
 * Uses tier, method, host, and URL patterns.
 *
 * @param {object|null} evidence - { tier, tierName, method, host, url }
 * @returns {"manufacturer_html"|"manual_pdf"|"support_docs"|"review"|"benchmark"|"retailer"|"database"|"fallback_web"|"targeted_single"}
 */
export function classifyEvidenceClass(evidence) {
  if (!evidence || typeof evidence !== 'object') return 'fallback_web';

  const tier = Number(evidence.tier) || 0;
  const tierName = String(evidence.tierName || '').toLowerCase();
  const method = String(evidence.method || '').toLowerCase();
  const host = String(evidence.host || '').toLowerCase();
  const url = String(evidence.url || '').toLowerCase();

  const isPdf = method.includes('pdf') || url.endsWith('.pdf');

  if (tier === 1 || tierName === 'manufacturer') {
    if (isPdf) return 'manual_pdf';
    if (SUPPORT_HOST_PATTERNS.test(host)) return 'support_docs';
    return 'manufacturer_html';
  }

  if (tierName === 'review') return 'review';
  if (tierName === 'retailer') return 'retailer';

  if (tier === 2) {
    if (isPdf) return 'manual_pdf';
    if (BENCHMARK_HOST_PATTERNS.test(host)) return 'benchmark';
    return 'database';
  }

  if (tier === 3) return 'fallback_web';

  return 'fallback_web';
}

function hasKnownValue(value) {
  return !UNKNOWN_VALUE_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function unionSorted(existing, additions) {
  const set = new Set(existing);
  for (const item of additions) {
    if (item) set.add(item);
  }
  return [...set].sort();
}

/**
 * Build per-field history maps from a completed round's artifacts.
 * Pure function — no side effects.
 *
 * @param {object} params
 * @param {object|null} params.previousFieldHistories - Previous round's field histories (keyed by field_key)
 * @param {object|null} params.provenance - Round provenance { [fieldKey]: { value, evidence: [] } }
 * @param {Array|null} params.searchPlanQueries - queries_generated from search plan
 * @param {number} params.duplicatesSuppressed - Total duplicates suppressed in anti-garbage filter
 * @returns {object} Updated field histories map
 */
export function buildFieldHistories({
  previousFieldHistories = {},
  provenance = {},
  searchPlanQueries = [],
  duplicatesSuppressed = 0,
} = {}) {
  const prev = previousFieldHistories && typeof previousFieldHistories === 'object' ? previousFieldHistories : {};
  const prov = provenance && typeof provenance === 'object' ? provenance : {};
  const queries = safeArray(searchPlanQueries);
  const suppressed = safeNum(duplicatesSuppressed);

  // Step 1: Collect all field keys that were touched this round
  // (either targeted by queries or have provenance entries)
  const targetedFields = new Set();
  const queryMap = new Map(); // fieldKey → [query strings]

  for (const q of queries) {
    const fields = safeArray(q?.target_fields);
    const queryText = String(q?.query || '').trim();
    for (const field of fields) {
      const fk = String(field).trim();
      if (!fk) continue;
      targetedFields.add(fk);
      if (!queryMap.has(fk)) queryMap.set(fk, []);
      if (queryText) queryMap.get(fk).push(queryText);
    }
  }

  // Also include fields that have provenance (evidence was found)
  for (const fk of Object.keys(prov)) {
    if (fk) targetedFields.add(fk);
  }

  // Also include fields from previous histories
  for (const fk of Object.keys(prev)) {
    if (fk) targetedFields.add(fk);
  }

  if (targetedFields.size === 0) return {};

  // Step 2: Build history for each field
  const result = {};

  for (const fk of targetedFields) {
    const prevHist = prev[fk] || {};
    const fieldProv = prov[fk] || {};
    const evidence = safeArray(fieldProv.evidence);
    const newQueries = queryMap.get(fk) || [];
    const wasTargeted = queryMap.has(fk);

    // existing_queries: union of previous + new
    const existingQueries = unionSorted(
      safeArray(prevHist.existing_queries),
      newQueries
    );

    // domains_tried: union of previous + evidence rootDomains
    const newDomains = evidence
      .map((e) => String(e?.rootDomain || '').trim())
      .filter(Boolean);
    const domainsTried = unionSorted(
      safeArray(prevHist.domains_tried),
      newDomains
    );

    // host_classes_tried: union of previous + classified from evidence
    const newHostClasses = evidence.map((e) => classifyHostClass(e));
    const hostClassesTried = unionSorted(
      safeArray(prevHist.host_classes_tried),
      newHostClasses
    );

    // evidence_classes_tried: union of previous + classified from evidence
    const newEvidenceClasses = evidence.map((e) => classifyEvidenceClass(e));
    const evidenceClassesTried = unionSorted(
      safeArray(prevHist.evidence_classes_tried),
      newEvidenceClasses
    );

    // query_count: previous + number of new queries targeting this field
    const queryCount = safeNum(prevHist.query_count) + newQueries.length;

    // urls_examined_count: previous + unique new evidence URLs
    const uniqueUrls = new Set(
      evidence.map((e) => String(e?.url || '').trim()).filter(Boolean)
    );
    const urlsExaminedCount = safeNum(prevHist.urls_examined_count) + uniqueUrls.size;

    // no_value_attempts: increment if field was targeted but still has no known value
    const fieldHasValue = hasKnownValue(fieldProv.value);
    const noValueIncrement = (wasTargeted && !fieldHasValue) ? 1 : 0;
    const noValueAttempts = safeNum(prevHist.no_value_attempts) + noValueIncrement;

    // duplicate_attempts_suppressed: previous + round's suppression count (for targeted fields)
    const dupIncrement = wasTargeted ? suppressed : 0;
    const duplicateAttemptsSuppressed = safeNum(prevHist.duplicate_attempts_suppressed) + dupIncrement;

    result[fk] = {
      existing_queries: existingQueries,
      domains_tried: domainsTried,
      host_classes_tried: hostClassesTried,
      evidence_classes_tried: evidenceClassesTried,
      query_count: queryCount,
      urls_examined_count: urlsExaminedCount,
      no_value_attempts: noValueAttempts,
      duplicate_attempts_suppressed: duplicateAttemptsSuppressed,
    };
  }

  return result;
}
