export function normalizeIdentityToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ambiguityLevelFromFamilyCount(count = 0) {
  const n = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
  if (n >= 9) return 'extra_hard';
  if (n >= 6) return 'very_hard';
  if (n >= 4) return 'hard';
  if (n >= 2) return 'medium';
  if (n === 1) return 'easy';
  return 'unknown';
}

export function normalizeAmbiguityLevel(value = '', familyModelCount = 0) {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'easy' || token === 'low') return 'easy';
  if (token === 'medium' || token === 'mid') return 'medium';
  if (token === 'hard' || token === 'high') return 'hard';
  if (token === 'very_hard' || token === 'very-hard' || token === 'very hard') return 'very_hard';
  if (token === 'extra_hard' || token === 'extra-hard' || token === 'extra hard') return 'extra_hard';
  return ambiguityLevelFromFamilyCount(familyModelCount);
}

export function resolveIdentityLockStatus(identityLock = {}) {
  const brand = normalizeIdentityToken(identityLock?.brand);
  const model = normalizeIdentityToken(identityLock?.model);
  const variant = normalizeIdentityToken(identityLock?.variant);
  const sku = normalizeIdentityToken(identityLock?.sku);
  const lockCount = [brand, model, variant, sku].filter(Boolean).length;
  if (brand && model && (variant || sku)) {
    return 'locked_full';
  }
  if (brand && model) {
    return 'locked_brand_model';
  }
  if (lockCount > 0) {
    return 'locked_partial';
  }
  return 'unlocked';
}

// --- Identity thresholds ---
const IDENTITY_LOCK_THRESHOLD = 0.95;
const IDENTITY_PROVISIONAL_THRESHOLD = 0.70;
const IDENTITY_DEFAULT_AUDIT_LIMIT = 24;

// --- Helpers (used by identity normalization) ---

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value, fallback = '') {
  const raw = String(value || '').trim();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  if (fallback) return fallback;
  return new Date().toISOString();
}

function normalizeReasonCode(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

function uniqueReasonCodes(values = []) {
  const out = [];
  const seen = new Set();
  for (const row of values || []) {
    const token = normalizeReasonCode(row);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function normalizeIdentityEvidenceRow(row = {}, index = 0) {
  const reasonCodes = uniqueReasonCodes(row?.reason_codes || row?.reasonCodes || []);
  return {
    source_id: String(row?.source_id || row?.sourceId || `source_${String(index + 1).padStart(3, '0')}`).trim(),
    url: String(row?.url || '').trim(),
    host: String(row?.host || '').trim(),
    root_domain: String(row?.root_domain || row?.rootDomain || '').trim(),
    role: String(row?.role || '').trim(),
    tier: Math.max(0, Number.parseInt(String(row?.tier ?? 0), 10) || 0),
    candidate_brand: String(row?.candidate_brand || row?.candidateBrand || '').trim(),
    candidate_model: String(row?.candidate_model || row?.candidateModel || '').trim(),
    identity_score: clamp01(toNumber(row?.identity_score ?? row?.identityScore, 0)),
    identity_confidence: clamp01(toNumber(row?.identity_confidence ?? row?.identityConfidence ?? row?.identity_score ?? row?.identityScore, 0)),
    reason_codes: reasonCodes,
  };
}

function normalizeIdentityContradictions(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      source: String(row?.source || '').trim(),
      conflict: String(row?.conflict || '').trim(),
    }))
    .filter((row) => row.source || row.conflict);
}

function normalizeFirstConflictTrigger(trigger = null) {
  if (!trigger || typeof trigger !== 'object') {
    return null;
  }
  return {
    source: String(trigger.source || '').trim(),
    conflict: String(trigger.conflict || '').trim(),
    contributors: (Array.isArray(trigger.contributors) ? trigger.contributors : [])
      .map((row, index) => normalizeIdentityEvidenceRow(row, index))
      .filter((row) => row.source_id || row.url),
  };
}

export function normalizeIdentityState(input = {}) {
  const token = String(input?.status || '').trim().toLowerCase();
  if (token === 'locked' || token === 'provisional' || token === 'unlocked' || token === 'conflict') {
    return token;
  }
  const confidence = clamp01(toNumber(input?.confidence, 0));
  const gateValidated = Boolean(input?.identity_gate_validated);
  const reasonCodes = uniqueReasonCodes(input?.reason_codes || []);
  const hasConflictCode = reasonCodes.some((code) =>
    code.includes('conflict')
    || code.includes('mismatch')
    || code.includes('major_anchor')
  );
  if (gateValidated && confidence >= IDENTITY_LOCK_THRESHOLD) {
    return 'locked';
  }
  if (hasConflictCode) {
    return 'conflict';
  }
  if (confidence >= IDENTITY_PROVISIONAL_THRESHOLD) {
    return 'provisional';
  }
  return 'unlocked';
}

export function normalizeIdentityContext(identityContext = {}, now = '') {
  const normalizedNow = toIso(now);
  const reasonCodes = uniqueReasonCodes(identityContext.reason_codes || []);
  const publishBlockers = uniqueReasonCodes(identityContext.publish_blockers || []);
  const contradictions = normalizeIdentityContradictions(identityContext.contradictions);
  const acceptedExactMatchSources = (Array.isArray(identityContext.accepted_exact_match_sources)
    ? identityContext.accepted_exact_match_sources
    : []
  )
    .map((row, index) => normalizeIdentityEvidenceRow(row, index))
    .filter((row) => row.source_id || row.url);
  const acceptedConflictContributors = (Array.isArray(identityContext.accepted_conflict_contributors)
    ? identityContext.accepted_conflict_contributors
    : []
  )
    .map((row, index) => ({
      ...normalizeIdentityEvidenceRow(row, index),
      contributing_conflicts: uniqueReasonCodes(row?.contributing_conflicts || row?.contributingConflicts || []),
    }))
    .filter((row) => row.source_id || row.url);
  const rejectedSiblingSources = (Array.isArray(identityContext.rejected_sibling_sources)
    ? identityContext.rejected_sibling_sources
    : []
  )
    .map((row, index) => normalizeIdentityEvidenceRow(row, index))
    .filter((row) => row.source_id || row.url);
  const firstConflictTrigger = normalizeFirstConflictTrigger(identityContext.first_conflict_trigger);
  const status = normalizeIdentityState({
    ...identityContext,
    reason_codes: reasonCodes
  });
  const confidence = clamp01(toNumber(identityContext.confidence, 0));
  const maxMatchScore = clamp01(toNumber(identityContext.max_match_score, confidence));
  const familyModelCount = Math.max(0, Number.parseInt(String(identityContext.family_model_count || 0), 10) || 0);
  const ambiguityLevel = normalizeAmbiguityLevel(identityContext.ambiguity_level, familyModelCount);
  const extractionGateOpen =
    Boolean(identityContext.extraction_gate_open)
    || status === 'locked';
  const auditRowsRaw = Array.isArray(identityContext.audit_rows) ? identityContext.audit_rows : [];
  const auditRows = auditRowsRaw
    .map((row, index) => ({
      source_id: String(row?.source_id || row?.sourceId || `source_${String(index + 1).padStart(3, '0')}`).trim(),
      url: String(row?.url || '').trim(),
      host: String(row?.host || '').trim(),
      decision: String(row?.decision || '').trim().toUpperCase(),
      confidence: clamp01(toNumber(row?.confidence, 0)),
      reason_codes: uniqueReasonCodes(row?.reason_codes || row?.reasonCodes || []),
      ts: toIso(row?.ts || row?.updated_at || normalizedNow, normalizedNow)
    }))
    .filter((row) => row.source_id || row.url)
    .slice(0, IDENTITY_DEFAULT_AUDIT_LIMIT);
  return {
    status,
    confidence,
    identity_gate_validated: Boolean(identityContext.identity_gate_validated),
    extraction_gate_open: extractionGateOpen,
    family_model_count: familyModelCount,
    ambiguity_level: ambiguityLevel,
    publishable: Boolean(identityContext.publishable),
    publish_blockers: publishBlockers,
    reason_codes: reasonCodes,
    page_count: Math.max(0, Number.parseInt(String(identityContext.page_count || 0), 10) || 0),
    contradiction_count: Math.max(
      0,
      Number.parseInt(
        String(identityContext.contradiction_count ?? contradictions.length),
        10,
      ) || contradictions.length,
    ),
    contradictions,
    accepted_exact_match_sources: acceptedExactMatchSources,
    accepted_conflict_contributors: acceptedConflictContributors,
    rejected_sibling_sources: rejectedSiblingSources,
    first_conflict_trigger: firstConflictTrigger,
    max_match_score: maxMatchScore,
    updated_at: normalizedNow,
    audit_rows: auditRows
  };
}
