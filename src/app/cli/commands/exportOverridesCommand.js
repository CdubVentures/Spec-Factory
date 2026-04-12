// WHY: Phase E3 disaster recovery — dump SQL override data to JSON matching *.overrides.json shape.
// Enables rebuilding override files from SQL if needed.
// createMigrateOverridesCommand: Overlap 0d — exports SQL → consolidated v2 overrides.json per category.

import { writeConsolidatedOverrides } from '../../../shared/consolidatedOverrides.js';

// ── Shared: build per-product override envelope ─────────────────────
// Phase 1b: product_review_state and getOverriddenFieldsForProduct are retired.
// Returns safe defaults — less metadata, but structurally compatible.

function buildProductOverridesFromSql(_specDb, _productId) {
  return {
    review_status: 'pending',
    review_started_at: null,
    reviewed_by: null,
    reviewed_at: null,
    overrides: {},
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
      // Phase 1b: listApprovedProductIds retired — return empty product list
      const productIds = [];
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
      // Phase 1b: listApprovedProductIds / listProductIdsWithOverrides retired — empty list
      const productIds = [];

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
