// WHY: Phase E3 disaster recovery — dump SQL override data to JSON matching *.overrides.json shape.
// Enables rebuilding override files from SQL if needed.
// createMigrateOverridesCommand: Overlap 0d — exports SQL → consolidated v2 overrides.json per category.

import { writeConsolidatedOverrides } from '../../../shared/consolidatedOverrides.js';

// ── Shared: build per-product override envelope from SQL ─────────────────────

function buildProductOverridesFromSql(specDb, productId) {
  const reviewState = specDb.getProductReviewState(productId);
  const overriddenRows = specDb.getOverriddenFieldsForProduct(productId);

  const overrides = {};
  for (const row of overriddenRows) {
    let provenance = null;
    if (row.override_provenance) {
      try { provenance = JSON.parse(row.override_provenance); } catch { /* keep null */ }
    }

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

export function createExportOverridesCommand({ withSpecDb }) {
  return async function commandExportOverrides(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('export-overrides requires --category <category>');
    }

    return withSpecDb(config, category, (specDb) => {
      const productIds = specDb.listApprovedProductIds();
      const products = productIds.map((productId) => ({
        version: 1,
        category,
        product_id: productId,
        ...buildProductOverridesFromSql(specDb, productId),
      }));

      return {
        command: 'export-overrides',
        category,
        product_count: products.length,
        products,
      };
    });
  };
}

// ── Migrate command (v2 consolidated format) ─────────────────────────────────

export function createMigrateOverridesCommand({ withSpecDb }) {
  return async function commandMigrateOverrides(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('migrate-overrides requires --category <category>');
    }

    return withSpecDb(config, category, async (specDb) => {
      // WHY: listProductIdsWithOverrides returns ALL products with overrides or review state,
      // not just approved. This prevents losing in_progress/draft overrides during migration.
      const productIds = typeof specDb.listProductIdsWithOverrides === 'function'
        ? specDb.listProductIdsWithOverrides()
        : specDb.listApprovedProductIds();

      const products = {};
      for (const productId of productIds) {
        products[productId] = buildProductOverridesFromSql(specDb, productId);
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
    });
  };
}
