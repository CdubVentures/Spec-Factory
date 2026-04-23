/**
 * Field-bucket evaluator — the single publish-gate function.
 *
 * Buckets candidates by value_fingerprint (scalar equality or list set-equality),
 * pools evidence across rows that agree, filters by per-ref confidence against
 * publishConfidenceThreshold, and returns the publishable value.
 *
 * Scalar / list winner_only: publishedValue = top qualifying bucket's value.
 * Set_union lists: publishedValue = union of ALL qualifying buckets' items,
 * sub-threshold buckets excluded from both the union and the resolve cascade.
 *
 * Consumed by publishCandidate, reconcileThreshold, republishField. Back-compat
 * checkEvidenceGate({candidateId}) shim routes through the evaluator.
 */

export function readMinEvidenceRefs(fieldRule) {
  const raw = fieldRule?.evidence?.min_evidence_refs;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return raw > 0 ? Math.floor(raw) : 0;
}

function parseListValue(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseScalarValue(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number' || typeof parsed === 'boolean' || parsed === null) return parsed;
    return raw;
  } catch {
    return raw;
  }
}

function isListShape(fieldRule) {
  return fieldRule?.contract?.shape === 'list';
}

function isSetUnion(fieldRule) {
  return fieldRule?.contract?.list_rules?.item_union === 'set_union';
}

/**
 * @param {{ specDb: object, productId: string, fieldKey: string, fieldRule: object, variantId?: string|null, threshold: number }} opts
 * @returns {{ buckets: Array<{value_fingerprint:string, value:*, memberIds:number[], pooledCount:number, qualifies:boolean}>, publishedValue:* , publishedMemberIds:number[], required:number }}
 */
export function evaluateFieldBuckets({ specDb, productId, fieldKey, fieldRule, variantId, threshold }) {
  const required = readMinEvidenceRefs(fieldRule);
  if (typeof specDb?.listFieldBuckets !== 'function') {
    return { buckets: [], publishedValue: undefined, publishedMemberIds: [], required };
  }
  const bucketRows = specDb.listFieldBuckets({ productId, fieldKey, variantId: variantId ?? null });

  // WHY: Bucket-level Gate 1 — at least one member must self-declare
  // confidence >= threshold. A bucket whose top LLM confidence is below the
  // publish threshold is "the model was guessing" and never publishes, even
  // if its evidence happens to pool over min_evidence_refs. This mirrors the
  // per-candidate Gate 1 in publishCandidate for the reconcile path which has
  // no single "triggering" candidate to check.
  const buckets = bucketRows.map(row => {
    const gate1Pass = (Number(row.top_confidence || 0) > 1
      ? Number(row.top_confidence || 0) / 100
      : Number(row.top_confidence || 0)) >= Number(threshold || 0);
    const pooledCount = (required === 0 || !gate1Pass)
      ? 0
      : specDb.countPooledQualifyingEvidenceByFingerprint({
        productId, fieldKey,
        fingerprint: row.value_fingerprint,
        variantId: variantId ?? null,
        minConfidence: threshold,
      });
    const listValue = isListShape(fieldRule) ? parseListValue(row.value) : null;
    const value = listValue !== null ? listValue : parseScalarValue(row.value);
    const gate2Pass = required === 0 ? true : pooledCount >= required;
    return {
      value_fingerprint: row.value_fingerprint,
      value,
      memberIds: row.member_ids,
      pooledCount,
      qualifies: gate1Pass && gate2Pass,
      top_confidence: row.top_confidence,
    };
  });

  const qualifying = buckets.filter(b => b.qualifies);
  if (qualifying.length === 0) {
    return { buckets, publishedValue: undefined, publishedMemberIds: [], required };
  }

  if (isListShape(fieldRule) && isSetUnion(fieldRule)) {
    const unionSet = new Set();
    const unionMemberIds = [];
    for (const b of qualifying) {
      if (Array.isArray(b.value)) {
        for (const item of b.value) unionSet.add(item);
      }
      for (const id of b.memberIds) unionMemberIds.push(id);
    }
    return {
      buckets,
      publishedValue: Array.from(unionSet),
      publishedMemberIds: unionMemberIds,
      required,
    };
  }

  const winner = qualifying[0];
  return {
    buckets,
    publishedValue: winner.value,
    publishedMemberIds: winner.memberIds,
    required,
  };
}

/**
 * Back-compat shim. Answers the evidence gate question for a single candidate
 * by looking up which bucket that candidate belongs to and reporting its pool.
 *
 * @param {{ specDb: object, candidateId: number, fieldRule: object }} opts
 */
export function checkEvidenceGate({ specDb, candidateId, fieldRule }) {
  const required = readMinEvidenceRefs(fieldRule);
  if (required <= 0) return { ok: true, required: 0, actual: 0 };
  if (!specDb || !candidateId) return { ok: false, required, actual: 0 };
  if (typeof specDb?.countPooledQualifyingEvidenceByFingerprint !== 'function') {
    return { ok: false, required, actual: 0 };
  }

  const row = specDb.db.prepare(
    `SELECT product_id, field_key, value_fingerprint, variant_id FROM field_candidates WHERE id = ?`
  ).get(candidateId);
  if (!row) return { ok: false, required, actual: 0 };

  const threshold = 0;
  const actual = specDb.countPooledQualifyingEvidenceByFingerprint({
    productId: row.product_id,
    fieldKey: row.field_key,
    fingerprint: row.value_fingerprint,
    variantId: row.variant_id,
    minConfidence: threshold,
  });
  return { ok: actual >= required, required, actual };
}
