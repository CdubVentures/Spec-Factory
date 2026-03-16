import { normalizeWhitespace } from '../../../utils/common.js';
import { verifyCandidateEvidence } from './evidenceVerifier.js';

const IDENTITY_KEYS = ['brand', 'model', 'sku', 'mpn', 'gtin', 'variant'];

function sanitizeIdentity(identity, identityLock) {
  const out = {};
  for (const key of IDENTITY_KEYS) {
    const value = normalizeWhitespace(identity?.[key] || '');
    if (!value || value.toLowerCase() === 'unk') {
      continue;
    }
    if (identityLock?.[key] && normalizeWhitespace(identityLock[key])) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function filterEvidenceRefs(refs, validRefs) {
  return [...new Set((refs || []).filter((id) => validRefs.has(id)))];
}

export function hasKnownValue(value) {
  const token = String(value || '').trim().toLowerCase();
  return token !== '' && token !== 'unk' && token !== 'null' && token !== 'undefined' && token !== 'n/a';
}

function normalizeCandidateValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCandidateValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(6)));
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return normalizeWhitespace(String(value));
}

export function sanitizeExtractionResult({
  result,
  job,
  fieldSet,
  validRefs,
  evidencePack,
  minEvidenceRefsByField = {},
  insufficientEvidenceAction = 'threshold_unmet'
}) {
  const identityCandidates = sanitizeIdentity(result?.identityCandidates, job.identityLock || {});
  const fieldCandidates = [];
  let droppedByEvidenceVerifier = 0;
  let droppedUnknownField = 0;
  let droppedUnknownValue = 0;
  let droppedMissingRefs = 0;
  let droppedInsufficientRefs = 0;
  let escalatedLowEvidenceCount = 0;
  let droppedInvalidRefs = 0;
  const rawFieldCandidates = Array.isArray(result?.fieldCandidates) ? result.fieldCandidates : [];
  const evidenceAction = String(insufficientEvidenceAction || 'threshold_unmet').trim().toLowerCase();

  for (const row of rawFieldCandidates) {
    const field = String(row.field || '').trim();
    const value = normalizeCandidateValue(row.value);
    const originalRefs = Array.isArray(row?.evidenceRefs)
      ? row.evidenceRefs.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const refs = filterEvidenceRefs(row.evidenceRefs, validRefs);

    if (!fieldSet.has(field)) {
      droppedUnknownField += 1;
      continue;
    }
    if (!hasKnownValue(value)) {
      droppedUnknownValue += 1;
      continue;
    }
    if (!refs.length) {
      droppedMissingRefs += 1;
      if (originalRefs.length > 0) {
        droppedInvalidRefs += 1;
      }
      continue;
    }
    const requiredMinRefs = Math.max(
      1,
      Number.parseInt(String(minEvidenceRefsByField?.[field] ?? 1), 10) || 1
    );
    const candidate = {
      field,
      value,
      method: 'llm_extract',
      keyPath: row.keyPath || 'llm.extract',
      evidenceRefs: refs,
      snippetId: row.snippetId || refs[0] || '',
      snippetHash: row.snippetHash || '',
      quote: row.quote || '',
      quoteSpan: Array.isArray(row.quoteSpan) ? row.quoteSpan : null
    };

    if (refs.length < requiredMinRefs) {
      if (evidenceAction !== 'escalate') {
        droppedInsufficientRefs += 1;
        continue;
      }
      candidate.method = 'llm_extract_escalated_low_evidence';
      candidate.low_evidence_escalated = true;
      candidate.requiredEvidenceRefs = requiredMinRefs;
      escalatedLowEvidenceCount += 1;
    }

    const evidenceCheck = verifyCandidateEvidence({
      candidate,
      evidencePack
    });
    if (!evidenceCheck.ok) {
      droppedByEvidenceVerifier += 1;
      continue;
    }

    fieldCandidates.push({
      field: evidenceCheck.candidate.field,
      value: evidenceCheck.candidate.value,
      method: evidenceCheck.candidate.method || 'llm_extract',
      keyPath: evidenceCheck.candidate.keyPath || 'llm.extract',
      evidenceRefs: evidenceCheck.candidate.evidenceRefs,
      snippetId: evidenceCheck.candidate.snippetId || '',
      snippetHash: evidenceCheck.candidate.snippetHash || '',
      quote: evidenceCheck.candidate.quote || '',
      low_evidence_escalated: Boolean(evidenceCheck.candidate.low_evidence_escalated),
      quoteSpan: Array.isArray(evidenceCheck.candidate.quoteSpan)
        ? evidenceCheck.candidate.quoteSpan
        : null
    });
  }

  const conflicts = [];
  for (const conflict of result?.conflicts || []) {
    const refs = filterEvidenceRefs(conflict.evidenceRefs, validRefs);
    if (!refs.length) {
      continue;
    }
    conflicts.push({
      field: String(conflict.field || ''),
      values: (conflict.values || []).map((value) => normalizeWhitespace(value)).filter(Boolean),
      evidenceRefs: refs
    });
  }

  const notes = (result?.notes || []).map((note) => normalizeWhitespace(note)).filter(Boolean);
  if (droppedByEvidenceVerifier > 0) {
    notes.push(`Dropped ${droppedByEvidenceVerifier} candidates by evidence verifier.`);
  }
  if (droppedInsufficientRefs > 0) {
    notes.push(`Dropped ${droppedInsufficientRefs} candidates below min_evidence_refs.`);
  }
  if (escalatedLowEvidenceCount > 0) {
    notes.push(`Escalated ${escalatedLowEvidenceCount} low-evidence candidates.`);
  }

  return {
    identityCandidates,
    fieldCandidates,
    conflicts,
    notes,
    droppedByEvidenceVerifier,
    metrics: {
      raw_candidate_count: rawFieldCandidates.length,
      accepted_candidate_count: fieldCandidates.length,
      dropped_unknown_field: droppedUnknownField,
      dropped_unknown_value: droppedUnknownValue,
      dropped_missing_refs: droppedMissingRefs,
      dropped_insufficient_refs: droppedInsufficientRefs,
      escalated_low_evidence_count: escalatedLowEvidenceCount,
      dropped_invalid_refs: droppedInvalidRefs,
      dropped_evidence_verifier: droppedByEvidenceVerifier
    }
  };
}
