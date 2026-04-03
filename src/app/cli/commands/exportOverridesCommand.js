// WHY: Phase E3 disaster recovery — dump SQL override data to JSON matching *.overrides.json shape.
// Enables rebuilding override files from SQL if needed.

export function createExportOverridesCommand({ openSpecDbForCategory }) {
  return async function commandExportOverrides(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('export-overrides requires --category <category>');
    }

    const specDb = await openSpecDbForCategory(config, category);
    try {
      const productIds = specDb.listApprovedProductIds();
      const products = productIds.map((productId) => {
        const reviewState = specDb.getProductReviewState(productId);
        const overriddenRows = specDb.getOverriddenFieldsForProduct(productId);
        // WHY: Join with candidate_reviews to include AI review state in export.
        const reviews = typeof specDb.getReviewsForContext === 'function'
          ? specDb.getReviewsForContext('item', productId) : [];
        const reviewMap = new Map(reviews.map((r) => [r.candidate_id, r]));
        const overrides = {};
        for (const row of overriddenRows) {
          let provenance = null;
          if (row.override_provenance) {
            try { provenance = JSON.parse(row.override_provenance); } catch { /* keep null */ }
          }
          const rev = reviewMap.get(row.accepted_candidate_id || '');
          const aiReview = rev && rev.ai_review_status && rev.ai_review_status !== 'not_run'
            ? {
              ai_review_status: rev.ai_review_status,
              ai_confidence: rev.ai_confidence,
              ai_reason: rev.ai_reason,
              ai_reviewed_at: rev.ai_reviewed_at,
              ai_review_model: rev.ai_review_model,
              human_override_ai: Boolean(rev.human_override_ai),
              human_override_ai_at: rev.human_override_ai_at || null,
            }
            : undefined;
          overrides[row.field_key] = {
            field: row.field_key,
            override_source: row.override_source || 'candidate_selection',
            override_value: row.override_value || row.value || '',
            override_reason: row.override_reason || null,
            override_provenance: provenance,
            overridden_by: row.overridden_by || null,
            overridden_at: row.overridden_at || row.updated_at || null,
            candidate_id: row.accepted_candidate_id || '',
            value: row.override_value || row.value || '',
            set_at: row.overridden_at || row.updated_at || null,
            ...(aiReview ? { ai_review: aiReview } : {}),
          };
        }
        return {
          version: 1,
          category,
          product_id: productId,
          review_status: reviewState?.review_status || 'pending',
          review_started_at: reviewState?.review_started_at || null,
          reviewed_by: reviewState?.reviewed_by || null,
          reviewed_at: reviewState?.reviewed_at || null,
          overrides,
        };
      });

      return {
        command: 'export-overrides',
        category,
        product_count: products.length,
        products,
      };
    } finally {
      try { specDb?.close(); } catch { /* no-op */ }
    }
  };
}
