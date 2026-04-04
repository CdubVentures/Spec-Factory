// WHY: Reconstructs the flat provenance shape from SQL (item_field_state),
// replacing latest/provenance.json file reads. Shape builder is a pure function.

/**
 * @param {Array<Object>} rows — from the _getProvenanceForProduct JOIN query
 * @returns {Object} flat { [fieldKey]: { value, confidence, host, source, evidence: [...] } }
 */
export function buildProvenanceFromRows(rows) {
  const result = {};
  for (const row of rows) {
    const hasCandidate = row.source_url != null;
    const evidence = hasCandidate ? [{
      url: row.evidence_url || row.source_url || '',
      source_id: row.source_url || '',
      host: row.source_host || '',
      rootDomain: row.source_root_domain || '',
      tier: row.source_tier ?? null,
      method: row.source_method || '',
      approvedDomain: Boolean(row.approved_domain),
      snippet_id: row.snippet_id || '',
      snippet_hash: row.snippet_hash || '',
      snippet_text: row.snippet_text || '',
      quote: row.quote || '',
      quote_span: (row.quote_span_start != null && row.quote_span_end != null)
        ? [row.quote_span_start, row.quote_span_end] : null,
      retrieved_at: row.evidence_retrieved_at || '',
    }] : [];

    result[row.field_key] = {
      value: row.value ?? '',
      confidence: row.confidence ?? 0,
      host: row.source_host || '',
      source: row.source || 'pipeline',
      source_id: row.source_url || '',
      url: row.evidence_url || row.source_url || '',
      snippet_id: row.snippet_id || '',
      snippet_hash: row.snippet_hash || '',
      quote: row.quote || '',
      evidence,
    };
  }
  return result;
}

/**
 * @param {{ category: string, stmts: { _getProvenanceForProduct: Object } }} opts
 * @returns {{ getProvenanceForProduct: (cat: string, productId: string) => Object }}
 */
export function createProvenanceStore({ category, stmts }) {
  function getProvenanceForProduct(cat, productId) {
    const resolvedCategory = String(cat || category || '').trim();
    const resolvedProductId = String(productId || '').trim();
    if (!resolvedCategory || !resolvedProductId) return {};
    const rows = stmts._getProvenanceForProduct.all(resolvedCategory, resolvedProductId);
    return buildProvenanceFromRows(rows);
  }

  return { getProvenanceForProduct };
}
