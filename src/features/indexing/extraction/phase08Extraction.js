function getBatchMetrics(sanitized = {}) {
  if (sanitized?.metrics && typeof sanitized.metrics === 'object') {
    return sanitized.metrics;
  }
  return {
    raw_candidate_count: Number(sanitized?.fieldCandidates?.length || 0),
    accepted_candidate_count: Number(sanitized?.fieldCandidates?.length || 0),
    dropped_missing_refs: 0,
    dropped_insufficient_refs: 0,
    dropped_invalid_refs: 0,
    dropped_evidence_verifier: 0
  };
}

function getMinRefsStats(fieldCandidates = [], minEvidenceRefsByField = {}) {
  let minRefsSatisfiedCount = 0;
  let minRefsTotal = 0;
  for (const row of fieldCandidates || []) {
    const field = String(row?.field || '').trim();
    const refsCount = Array.isArray(row?.evidenceRefs) ? row.evidenceRefs.length : 0;
    const minRefs = Number(minEvidenceRefsByField?.[field] || 1);
    minRefsTotal += 1;
    if (refsCount >= Math.max(1, minRefs)) {
      minRefsSatisfiedCount += 1;
    }
  }
  return {
    min_refs_satisfied_count: Number(minRefsSatisfiedCount || 0),
    min_refs_total: Number(minRefsTotal || 0)
  };
}

export function createEmptyPhase08({
  nowIso = new Date().toISOString()
} = {}) {
  return {
    generated_at: nowIso,
    summary: {
      batch_count: 0,
      batch_error_count: 0,
      schema_fail_rate: 0,
      raw_candidate_count: 0,
      accepted_candidate_count: 0,
      dangling_snippet_ref_count: 0,
      dangling_snippet_ref_rate: 0,
      evidence_policy_violation_count: 0,
      evidence_policy_violation_rate: 0,
      min_refs_satisfied_count: 0,
      min_refs_total: 0,
      min_refs_satisfied_rate: 0
    },
    batches: [],
    field_contexts: {},
    prime_sources: {
      rows: []
    }
  };
}

export function mergePhase08FieldContexts(target = {}, source = {}) {
  const out = { ...(target || {}) };
  for (const [field, context] of Object.entries(source || {})) {
    const key = String(field || '').trim();
    if (!key || out[key]) continue;
    out[key] = context;
  }
  return out;
}

export function mergePhase08PrimeRows(target = [], source = []) {
  const out = [...(target || [])];
  const seen = new Set(out.map((row) => `${row?.field_key || ''}|${row?.snippet_id || ''}|${row?.url || ''}`));
  for (const row of source || []) {
    const key = `${row?.field_key || ''}|${row?.snippet_id || ''}|${row?.url || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function buildCompletedPhase08BatchRow({
  batchId,
  routeReason,
  model,
  batchFields = [],
  promptEvidence = {},
  sanitized = {},
  minEvidenceRefsByField = {},
  elapsedMs = 0
} = {}) {
  const batchMetrics = getBatchMetrics(sanitized);
  const minRefsStats = getMinRefsStats(sanitized?.fieldCandidates || [], minEvidenceRefsByField);

  return {
    batch_id: String(batchId || ''),
    status: 'completed',
    route_reason: String(routeReason || ''),
    model: String(model || ''),
    target_field_count: batchFields.length,
    snippet_count: Number(promptEvidence?.snippets?.length || 0),
    reference_count: Number(promptEvidence?.references?.length || 0),
    raw_candidate_count: Number(batchMetrics.raw_candidate_count || 0),
    accepted_candidate_count: Number(batchMetrics.accepted_candidate_count || 0),
    dropped_missing_refs: Number(batchMetrics.dropped_missing_refs || 0),
    dropped_invalid_refs: Number(batchMetrics.dropped_invalid_refs || 0),
    dropped_evidence_verifier: Number(batchMetrics.dropped_evidence_verifier || 0),
    min_refs_satisfied_count: minRefsStats.min_refs_satisfied_count,
    min_refs_total: minRefsStats.min_refs_total,
    elapsed_ms: Math.max(0, Number(elapsedMs || 0))
  };
}

function buildPhase08SummaryFromBatches(batchRows = [], batchErrorCount = 0) {
  const rawCandidateCount = batchRows.reduce((sum, row) => sum + Number(row?.raw_candidate_count || 0), 0);
  const acceptedCandidateCount = batchRows.reduce((sum, row) => sum + Number(row?.accepted_candidate_count || 0), 0);
  const danglingRefCount = batchRows.reduce((sum, row) => sum + Number(row?.dropped_invalid_refs || 0), 0);
  const policyViolationCount = batchRows.reduce(
    (sum, row) => sum
      + Number(row?.dropped_missing_refs || 0)
      + Number(row?.dropped_invalid_refs || 0)
      + Number(row?.dropped_evidence_verifier || 0),
    0
  );
  const minRefsSatisfiedCount = batchRows.reduce((sum, row) => sum + Number(row?.min_refs_satisfied_count || 0), 0);
  const minRefsTotal = batchRows.reduce((sum, row) => sum + Number(row?.min_refs_total || 0), 0);
  const batchCount = batchRows.length;

  return {
    batch_count: batchCount,
    batch_error_count: Number(batchErrorCount || 0),
    schema_fail_rate: batchCount > 0
      ? Number((Number(batchErrorCount || 0) / batchCount).toFixed(6))
      : 0,
    raw_candidate_count: rawCandidateCount,
    accepted_candidate_count: acceptedCandidateCount,
    dangling_snippet_ref_count: danglingRefCount,
    dangling_snippet_ref_rate: rawCandidateCount > 0
      ? Number((danglingRefCount / rawCandidateCount).toFixed(6))
      : 0,
    evidence_policy_violation_count: policyViolationCount,
    evidence_policy_violation_rate: rawCandidateCount > 0
      ? Number((policyViolationCount / rawCandidateCount).toFixed(6))
      : 0,
    min_refs_satisfied_count: minRefsSatisfiedCount,
    min_refs_total: minRefsTotal,
    min_refs_satisfied_rate: minRefsTotal > 0
      ? Number((minRefsSatisfiedCount / minRefsTotal).toFixed(6))
      : 0
  };
}

export function buildPhase08ExtractionPayload({
  batchRows = [],
  batchErrorCount = 0,
  fieldContexts = {},
  primeRows = [],
  nowIso = new Date().toISOString()
} = {}) {
  return {
    generated_at: nowIso,
    summary: buildPhase08SummaryFromBatches(batchRows, batchErrorCount),
    batches: batchRows,
    field_contexts: fieldContexts,
    prime_sources: {
      rows: primeRows.slice(0, 120)
    }
  };
}
