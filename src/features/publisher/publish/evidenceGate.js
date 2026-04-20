/**
 * Evidence gate — checks that a candidate has at least min_evidence_refs
 * distinct evidence refs before it's eligible to publish.
 *
 * Reads from field_candidate_evidence (SQL projection of metadata.evidence_refs).
 * Relies on submitCandidate / rebuild paths to keep the projection populated.
 *
 * Returns { ok: true, required, actual } on pass, { ok: false, required, actual } on fail.
 * Gate is a no-op when required <= 0 (rule not authored or explicitly off).
 */

export function readMinEvidenceRefs(fieldRule) {
  const raw = fieldRule?.evidence?.min_evidence_refs;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return raw > 0 ? Math.floor(raw) : 0;
}

export function checkEvidenceGate({ specDb, candidateId, fieldRule }) {
  const required = readMinEvidenceRefs(fieldRule);
  if (required <= 0) return { ok: true, required: 0, actual: 0 };
  // WHY: substantive count excludes refs tagged evidence_kind === 'identity_only'
  // — those URLs pin the SKU but don't support the claim itself. Legacy rows
  // with NULL evidence_kind count as substantive so pre-upgrade data still passes.
  const counter = specDb?.countFieldCandidateSubstantiveEvidenceByCandidateId
    || specDb?.countFieldCandidateEvidenceByCandidateId;
  if (!counter || !candidateId) {
    return { ok: false, required, actual: 0 };
  }
  const actual = counter.call(specDb, candidateId);
  return { ok: actual >= required, required, actual };
}
