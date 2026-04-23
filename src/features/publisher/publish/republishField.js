import { evaluateFieldBuckets } from './evidenceGate.js';

/**
 * Re-evaluate and republish a single field from its remaining candidates.
 *
 * WHY: After candidate deletion, the published field value may need recalculation.
 * Delegates gating to evaluateFieldBuckets so pooled-evidence + set_union union
 * semantics stay identical to publishCandidate and reconcileThreshold.
 *
 * Caller owns product.json file I/O — this function mutates productJson in place.
 *
 * @param {{ specDb, productId: string, fieldKey: string, config: object, productJson: object, variantId?: string|null }} opts
 * @returns {{ status: 'republished'|'unpublished'|'unchanged' }}
 */
export function republishField({ specDb, productId, fieldKey, config, productJson, variantId }) {
  const isVariantScoped = variantId != null;
  const publishedContainer = isVariantScoped
    ? (productJson.variant_fields?.[variantId] ?? null)
    : (productJson.fields ?? null);

  if (!publishedContainer?.[fieldKey]) {
    return { status: 'unchanged' };
  }

  const remaining = specDb.getFieldCandidatesByProductAndField(
    productId,
    fieldKey,
    isVariantScoped ? variantId : undefined,
  );

  if (remaining.length === 0) {
    delete publishedContainer[fieldKey];
    if (isVariantScoped && Object.keys(publishedContainer).length === 0) {
      delete productJson.variant_fields[variantId];
    }
    return { status: 'unpublished' };
  }

  const threshold = config?.publishConfidenceThreshold ?? 0.7;
  const compiled = specDb.getCompiledRules?.();
  const fieldRule = compiled?.fields?.[fieldKey] || null;

  const evalResult = evaluateFieldBuckets({
    specDb, productId, fieldKey, fieldRule,
    variantId: isVariantScoped ? variantId : null,
    threshold,
  });

  if (evalResult.publishedValue === undefined) {
    specDb.demoteResolvedCandidates(productId, fieldKey, isVariantScoped ? variantId : undefined);
    delete publishedContainer[fieldKey];
    if (isVariantScoped && Object.keys(publishedContainer).length === 0) {
      delete productJson.variant_fields[variantId];
    }
    return { status: 'unpublished' };
  }

  specDb.demoteResolvedCandidates(productId, fieldKey, isVariantScoped ? variantId : undefined);
  const memberIds = new Set(evalResult.publishedMemberIds);
  if (memberIds.size > 0) {
    const placeholders = Array.from(memberIds).map(() => '?').join(',');
    specDb.db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE id IN (${placeholders})`
    ).run(...Array.from(memberIds));
  }

  const winner = remaining
    .filter(r => memberIds.has(r.id))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
    || remaining.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  const sources = winner?.source_id
    ? [{ source: winner.source_type || '', source_id: winner.source_id, model: winner.model || '', confidence: winner.confidence ?? 0 }]
    : [];

  publishedContainer[fieldKey] = {
    value: evalResult.publishedValue,
    confidence: winner?.confidence ?? 0,
    source: 'pipeline',
    resolved_at: new Date().toISOString(),
    sources,
    linked_candidates: remaining.map(r => ({
      candidate_id: r.id,
      source_id: r.source_id || '',
      source_type: r.source_type || '',
      model: r.model || '',
      value: r.value,
      confidence: r.confidence,
      status: r.status,
      submitted_at: r.submitted_at,
    })),
  };

  return { status: 'republished' };
}
