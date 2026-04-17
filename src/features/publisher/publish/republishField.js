import { normalizeConfidence } from './publishCandidate.js';

/**
 * Re-evaluate and republish a single field from its remaining candidates.
 *
 * WHY: After candidate deletion, the published field value may need recalculation.
 * Handles set_union merge, scalar pick, confidence gating, and linked_candidates.
 *
 * Caller owns product.json file I/O — this function mutates productJson in place.
 *
 * @param {{ specDb, productId: string, fieldKey: string, config: object, productJson: object, variantId?: string|null }} opts
 *   variantId undefined/null → variant-blind (scalar fields[fieldKey])
 *   variantId set → variant-scoped (variant_fields[vid][fieldKey])
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
  const aboveThreshold = remaining.filter(c => normalizeConfidence(c.confidence) >= threshold);

  if (aboveThreshold.length === 0) {
    specDb.demoteResolvedCandidates(productId, fieldKey, isVariantScoped ? variantId : undefined);
    delete publishedContainer[fieldKey];
    if (isVariantScoped && Object.keys(publishedContainer).length === 0) {
      delete productJson.variant_fields[variantId];
    }
    return { status: 'unpublished' };
  }

  specDb.demoteResolvedCandidates(productId, fieldKey, isVariantScoped ? variantId : undefined);

  const compiled = specDb.getCompiledRules?.();
  const compiledFields = compiled?.fields || {};
  const fieldRule = compiledFields[fieldKey] || null;
  const itemUnion = fieldRule?.contract?.list_rules?.item_union;

  let publishedValue;
  let publishedConfidence;
  let winner;

  if (itemUnion === 'set_union') {
    const merged = [];
    const seen = new Set();
    let bestConfidence = 0;
    let bestRow = null;
    for (const row of aboveThreshold) {
      let items;
      try { items = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { items = null; }
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const s = typeof item === 'object' ? JSON.stringify(item) : String(item);
        if (!seen.has(s)) { seen.add(s); merged.push(item); }
      }
      specDb.markFieldCandidateResolved(productId, fieldKey, row.value, isVariantScoped ? variantId : undefined);
      if ((row.confidence ?? 0) > bestConfidence) {
        bestConfidence = row.confidence ?? 0;
        bestRow = row;
      }
    }
    publishedValue = merged;
    publishedConfidence = bestConfidence;
    winner = bestRow || aboveThreshold[0];
  } else {
    winner = aboveThreshold.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    specDb.markFieldCandidateResolved(productId, fieldKey, winner.value, isVariantScoped ? variantId : undefined);
    try { publishedValue = typeof winner.value === 'string' ? JSON.parse(winner.value) : winner.value; }
    catch { publishedValue = winner.value; }
    publishedConfidence = winner.confidence ?? 0;
  }

  // WHY: Source-centric rows have no sources_json — build from row columns.
  const sources = winner.source_id
    ? [{ source: winner.source_type || '', source_id: winner.source_id, model: winner.model || '', confidence: winner.confidence ?? 0 }]
    : (Array.isArray(winner.sources_json) ? winner.sources_json : []);

  publishedContainer[fieldKey] = {
    value: publishedValue,
    confidence: publishedConfidence,
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
