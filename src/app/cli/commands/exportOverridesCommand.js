// WHY: Phase E3 disaster recovery — dump SQL override data to JSON matching *.overrides.json shape.
// Enables rebuilding override files from SQL if needed.
// createMigrateOverridesCommand: Overlap 0d — exports SQL → consolidated v2 overrides.json per category.

import { writeConsolidatedOverrides } from '../../../shared/consolidatedOverrides.js';

// ── Shared: build per-product override envelope from SQL ─────────────────────

function buildProductOverridesFromSql(specDb, category, productId) {
  const reviewState = specDb.getProductReviewState(productId);
  const overriddenRows = specDb.getOverriddenFieldsForProduct(productId);

  const overrides = {};
  for (const row of overriddenRows) {
    let provenance = null;
    if (row.override_provenance) {
      try { provenance = JSON.parse(row.override_provenance); } catch { /* keep null */ }
    }

    // WHY: Dual-lookup for AI review — runtime writes contextId = itemFieldStateId,
    // seed writes contextId = productId. Check both to find the most recent review.
    let rev = null;
    const fieldStateRow = typeof specDb.getItemFieldStateByProductAndField === 'function'
      ? specDb.getItemFieldStateByProductAndField(productId, row.field_key)
      : null;
    if (fieldStateRow?.id) {
      const reviewsByStateId = typeof specDb.getReviewsForContext === 'function'
        ? specDb.getReviewsForContext('item', String(fieldStateRow.id))
        : [];
      rev = reviewsByStateId.find(r => r.candidate_id === (row.accepted_candidate_id || ''));
    }
    if (!rev) {
      const reviewsByProduct = typeof specDb.getReviewsForContext === 'function'
        ? specDb.getReviewsForContext('item', productId)
        : [];
      rev = reviewsByProduct.find(r => r.candidate_id === (row.accepted_candidate_id || ''));
    }

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
    review_status: reviewState?.review_status || 'pending',
    review_started_at: reviewState?.review_started_at || null,
    reviewed_by: reviewState?.reviewed_by || null,
    reviewed_at: reviewState?.reviewed_at || null,
    overrides,
  };
}

// ── Export command (legacy v1 per-product format) ─────────────────────────────

export function createExportOverridesCommand({ openSpecDbForCategory }) {
  return async function commandExportOverrides(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('export-overrides requires --category <category>');
    }

    const specDb = await openSpecDbForCategory(config, category);
    try {
      const productIds = specDb.listApprovedProductIds();
      const products = productIds.map((productId) => ({
        version: 1,
        category,
        product_id: productId,
        ...buildProductOverridesFromSql(specDb, category, productId),
      }));

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

// ── Migrate command (v2 consolidated format) ─────────────────────────────────

export function createMigrateOverridesCommand({ openSpecDbForCategory }) {
  return async function commandMigrateOverrides(config, _storage, args) {
    const category = String(args?.category || '').trim();
    if (!category) {
      throw new Error('migrate-overrides requires --category <category>');
    }

    const specDb = await openSpecDbForCategory(config, category);
    try {
      // WHY: listProductIdsWithOverrides returns ALL products with overrides or review state,
      // not just approved. This prevents losing in_progress/draft overrides during migration.
      const productIds = typeof specDb.listProductIdsWithOverrides === 'function'
        ? specDb.listProductIdsWithOverrides()
        : specDb.listApprovedProductIds();

      const products = {};
      for (const productId of productIds) {
        products[productId] = buildProductOverridesFromSql(specDb, category, productId);
      }

      const envelope = {
        version: 2,
        category,
        updated_at: new Date().toISOString(),
        products,
      };

      await writeConsolidatedOverrides({ config, category, envelope });

      return {
        command: 'migrate-overrides',
        category,
        migrated_count: productIds.length,
        path: `category_authority/${category}/_overrides/overrides.json`,
      };
    } finally {
      try { specDb?.close(); } catch { /* no-op */ }
    }
  };
}
