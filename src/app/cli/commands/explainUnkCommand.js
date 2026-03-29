export function createExplainUnkCommand({ openSpecDbForCategory } = {}) {
  return async function commandExplainUnk(config, storage, args) {
    const category = String(args.category || 'mouse').trim();
    const productId = String(args['product-id'] || '').trim();

    if (!productId) {
      throw new Error('explain-unk requires --product-id (random IDs cannot be derived from identity)');
    }

    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    try {
    const latestBase = storage.resolveOutputKey(category, productId, 'latest');
    const summary = specDb
      ? specDb.getSummaryForProduct(productId)
      : (await storage.readJsonOrNull(`${latestBase}/summary.json`));
    const normalized = specDb
      ? specDb.getNormalizedForProduct(productId)
      : (await storage.readJsonOrNull(`${latestBase}/normalized.json`));
    if (!summary && !normalized) {
      throw new Error(`No latest run found for productId '${productId}' in category '${category}'`);
    }

    const fieldReasoning = summary?.field_reasoning || {};
    const fields = normalized?.fields || {};
    const unknownFields = [];
    for (const [field, value] of Object.entries(fields)) {
      if (String(value || '').trim().toLowerCase() !== 'unk') {
        continue;
      }
      const row = fieldReasoning[field] || {};
      unknownFields.push({
        field,
        unknown_reason: row.unknown_reason || 'not_found_after_search',
        reasons: row.reasons || [],
        contradictions: row.contradictions || [],
      });
    }

    return {
      command: 'explain-unk',
      category,
      productId,
      run_id: summary?.runId || summary?.run_id || null,
      validated: Boolean(summary?.validated),
      unknown_field_count: unknownFields.length,
      unknown_fields: unknownFields,
      searches_attempted: summary?.searches_attempted || [],
      urls_fetched_count: (summary?.urls_fetched || []).length,
      top_evidence_references: summary?.top_evidence_references || [],
    };
    } finally {
      try { specDb?.close(); } catch { /* */ }
    }
  };
}
