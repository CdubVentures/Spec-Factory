/**
 * Field Candidate Evidence — SQL projection of metadata_json.evidence_refs.
 *
 * JSON in product.json.candidates[n].metadata.evidence_refs is the canonical
 * source (SSOT). This store is the read projection: one row per evidence
 * entry, indexed by (candidate_id, tier) for fast tier-filtered queries.
 *
 * Rebuild contract: populated from JSON during rebuildFieldCandidatesFromJson.
 * Cascade delete: rows remove automatically when their candidate is deleted.
 */

/**
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createFieldCandidateEvidenceStore({ category, stmts }) {
  function insert({ candidateId, url, tier, confidence }) {
    stmts._insertFieldCandidateEvidence.run({
      candidate_id: Number(candidateId),
      url: String(url || ''),
      tier: String(tier || 'unknown'),
      confidence: Number.isFinite(confidence) ? Number(confidence) : null,
    });
  }

  function insertMany(candidateId, refs) {
    if (!Array.isArray(refs) || refs.length === 0) return 0;
    let count = 0;
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object') continue;
      const url = String(ref.url || '').trim();
      if (!url) continue;
      insert({
        candidateId,
        url,
        tier: ref.tier,
        confidence: ref.confidence,
      });
      count++;
    }
    return count;
  }

  function deleteByCandidateId(candidateId) {
    stmts._deleteFieldCandidateEvidenceByCandidateId.run(Number(candidateId));
  }

  function listByCandidateId(candidateId) {
    return stmts._listFieldCandidateEvidenceByCandidateId.all(Number(candidateId));
  }

  function listByTier(tier) {
    return stmts._listFieldCandidateEvidenceByTier.all(category, String(tier || ''));
  }

  function countByCandidateId(candidateId) {
    const row = stmts._countFieldCandidateEvidenceByCandidateId.get(Number(candidateId));
    return Number(row?.total || 0);
  }

  function replaceForCandidate(candidateId, refs) {
    deleteByCandidateId(candidateId);
    return insertMany(candidateId, refs);
  }

  return {
    insert,
    insertMany,
    deleteByCandidateId,
    listByCandidateId,
    listByTier,
    countByCandidateId,
    replaceForCandidate,
  };
}
