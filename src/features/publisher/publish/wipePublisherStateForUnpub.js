/**
 * wipePublisherStateForUnpub — roll back the publisher-observable state on
 * candidate rows that were demoted by UnPub (resolved → candidate).
 *
 * When a field is published:
 *   1. `field_candidates.status` becomes 'resolved'
 *   2. `field_candidates.metadata_json.publish_result` is stamped
 *   3. `field_candidate_evidence` rows were already inserted at submission
 *   4. `field_candidates.confidence` carries the LLM's raw signal, which the
 *      publisher's evidence gate read + propagated (no recompute, but it is
 *      the number the UI renders as a "confidence pill" on a resolved row)
 *
 * `clearPublishedField` already handles (1) + (2) + the product.json side.
 * This helper handles (3) + (4): delete evidence rows and zero the
 * confidence so a demoted row stops rendering as "high-confidence resolved"
 * in the panels. The row itself survives — preserves the LLM-submitted
 * value for re-run / review — but every publisher-stamped scoring signal
 * is wiped. A subsequent run will repopulate confidence + evidence.
 *
 * Scope mirrors clearPublishedField's three scopes:
 *   - scalar (variantId undefined + allVariants=false): every row for (pid, fk)
 *     whose status is 'candidate' post-demote (i.e. was just resolved)
 *   - variant-single (variantId set): rows matching that variant_id
 *   - variant-all (allVariants=true): every variant_id for (pid, fk)
 *
 * Caller MUST run `demoteResolvedCandidates(...)` before calling this,
 * otherwise the "was resolved" filter can't tell apart rows that were
 * already candidates from rows that just got demoted. For the existing
 * UnPub flows (clearPublishedField + keyFinder unpublish route), both
 * correctly demote first then wipe.
 */

/**
 * @param {object} opts
 * @param {object} opts.specDb
 * @param {string} opts.productId
 * @param {string} opts.fieldKey
 * @param {string} [opts.variantId] — null/undefined for scalar + variant-all
 * @param {boolean} [opts.allVariants] — true for variant-all scope
 * @returns {{ wiped: number }} — number of candidate rows that had state wiped
 */
export function wipePublisherStateForUnpub({ specDb, productId, fieldKey, variantId, allVariants }) {
  if (typeof specDb?.getFieldCandidatesByProductAndField !== 'function') {
    return { wiped: 0 };
  }

  // getByProductAndField(pid, fk, undefined) → all rows regardless of variant.
  // getByProductAndField(pid, fk, null) → only variant-less rows.
  // getByProductAndField(pid, fk, 'v_x') → only that variant.
  const scopeArg = allVariants === true
    ? undefined
    : (typeof variantId === 'string' && variantId.length > 0 ? variantId : null);
  const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey, scopeArg) || [];

  let wiped = 0;
  for (const row of rows) {
    if (!row || typeof row.id !== 'number') continue;
    // Evidence: deletes all field_candidate_evidence for this candidate id.
    // Safe no-op when the row had no evidence.
    if (typeof specDb.deleteFieldCandidateEvidenceByCandidateId === 'function') {
      specDb.deleteFieldCandidateEvidenceByCandidateId(row.id);
    }
    // Confidence: zero so the row stops rendering as "resolved-looking".
    // Row keeps its value + source_id so a re-run via the same source can
    // upsert fresh confidence + fresh evidence without duplicating the row.
    if (typeof specDb.resetFieldCandidateConfidence === 'function') {
      specDb.resetFieldCandidateConfidence(row.id);
    }
    wiped += 1;
  }

  return { wiped };
}
