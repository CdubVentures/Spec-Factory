/**
 * Product Reconciler — scans existing product input files,
 * detects orphans with fabricated variants, and optionally removes them.
 *
 * An "orphan" is a product input file whose variant is fabricated
 * (variant tokens are a subset of model tokens) AND a canonical
 * version (without variant) already exists.
 */

import { isFabricatedVariant, cleanVariant } from '../identity/identityDedup.js';
import { loadQueueState, saveQueueState } from '../../../queue/queueState.js';
import { loadCanonicalIdentityIndex } from '../identity/identityGate.js';

import { normalizeTokenCollapsed } from '../../../shared/primitives.js';

function pairKey(brand, model) {
  const b = normalizeTokenCollapsed(brand);
  const m = normalizeTokenCollapsed(model);
  if (!b || !m) return '';
  return `${b}||${m}`;
}

function tupleKey(brand, model, variant) {
  return `${pairKey(brand, model)}||${normalizeTokenCollapsed(cleanVariant(variant))}`;
}

/**
 * Scan all product input files in a category and classify them.
 *
 * Returns:
 *   canonical[]  — products with no variant or a real variant
 *   orphans[]    — products with fabricated variants whose canonical exists
 *   warnings[]   — products with fabricated variants but NO canonical (needs manual review)
 */
export async function scanOrphans({ storage, category, config = {}, specDb = null }) {
  // WHY: SQL is the source of truth for products — no fixture scan needed.
  const dbRows = specDb ? specDb.getAllProducts() : [];

  const products = [];
  for (const row of dbRows) {
    products.push({
      key: '',
      productId: String(row.product_id || '').trim(),
      brand: String(row.brand || '').trim(),
      base_model: String(row.base_model || '').trim(),
      model: String(row.model || '').trim(),
      variant: String(row.variant || '').trim(),
      hasSeed: false,
      seedSource: null
    });
  }

  const canonicalIndex = specDb || config?.categoryAuthorityRoot
    ? await loadCanonicalIdentityIndex({
      config,
      category,
      specDb
    })
    : { source: 'none', pairVariants: new Map(), tupleToProductId: new Map() };
  const hasCanonicalSource = canonicalIndex.source !== 'none'
    && canonicalIndex.pairVariants.size > 0;

  if (hasCanonicalSource) {
    const canonical = [];
    const orphans = [];
    const untracked = [];
    const warnings = [];

    for (const p of products) {
      const pPairKey = pairKey(p.brand, p.base_model);
      const canonicalVariants = canonicalIndex.pairVariants.get(pPairKey);

      // WHY: Check fabricated variants BEFORE canonical index lookup.
      // When the canonical index is built from specDb (all products), fabricated
      // variants have their own tuple keys and would appear "canonical" otherwise.
      if (cleanVariant(p.variant) && isFabricatedVariant(p.base_model, p.variant)) {
        const canonicalPid = canonicalIndex.tupleToProductId.get(tupleKey(p.brand, p.base_model, '')) || '';
        if (canonicalPid) {
          orphans.push({
            ...p,
            canonicalProductId: canonicalPid,
            reason: 'fabricated_variant_with_canonical'
          });
        } else {
          // WHY: Fabricated variant exists but no canonical base product.
          // This is a warning, not an orphan — we can't safely delete without a canonical target.
          warnings.push({
            ...p,
            reason: 'fabricated_variant_no_canonical'
          });
        }
        continue;
      }

      const canonicalProductId = canonicalIndex.tupleToProductId.get(
        tupleKey(p.brand, p.base_model, p.variant)
      ) || '';

      if (canonicalProductId) {
        canonical.push({
          ...p,
          canonicalProductId
        });
        continue;
      }

      if (!canonicalVariants || canonicalVariants.size === 0) {
        untracked.push({
          ...p,
          reason: 'not_in_canonical_source'
        });
        continue;
      }

      if (cleanVariant(p.variant)) {
        orphans.push({
          ...p,
          canonicalProductId: canonicalIndex.tupleToProductId.get(tupleKey(p.brand, p.base_model, '')) || '',
          reason: 'variant_not_in_canonical'
        });
        continue;
      }

      untracked.push({
        ...p,
        reason: 'canonical_variant_mismatch'
      });
    }

    return {
      category,
      canonical_source: canonicalIndex.source,
      total_scanned: products.length,
      canonical_count: canonical.length,
      orphan_count: orphans.length,
      warning_count: warnings.length + untracked.length,
      untracked_count: untracked.length,
      canonical,
      orphans,
      warnings: [...warnings, ...untracked],
      untracked
    };
  }

  // Build identity lookup: brand+model → productId for canonical products
  const canonical = [];
  const fabricated = [];

  for (const p of products) {
    if (isFabricatedVariant(p.base_model, p.variant)) {
      fabricated.push(p);
    } else {
      canonical.push(p);
    }
  }

  const canonicalByIdentity = new Map();
  for (const p of canonical) {
    const key = `${normalizeTokenCollapsed(p.brand)}||${normalizeTokenCollapsed(p.base_model)}`;
    canonicalByIdentity.set(key, p.productId);
  }

  // Classify fabricated: orphan (canonical exists) vs warning (no canonical)
  const orphans = [];
  const warnings = [];

  for (const p of fabricated) {
    const key = `${normalizeTokenCollapsed(p.brand)}||${normalizeTokenCollapsed(p.base_model)}`;
    const matchedPid = canonicalByIdentity.get(key);
    if (matchedPid) {
      orphans.push({
        ...p,
        canonicalProductId: matchedPid,
        reason: 'fabricated_variant_with_canonical'
      });
    } else {
      warnings.push({
        ...p,
        reason: 'fabricated_variant_no_canonical'
      });
    }
  }

  return {
    category,
    canonical_source: 'inputs_fallback',
    total_scanned: products.length,
    canonical_count: canonical.length,
    orphan_count: orphans.length,
    warning_count: warnings.length,
    untracked_count: warnings.length,
    canonical,
    orphans,
    warnings,
    untracked: warnings
  };
}

/**
 * Remove orphan product files and their queue entries.
 *
 * In dry-run mode, returns what WOULD be removed without modifying anything.
 */
export async function reconcileOrphans({
  storage,
  category,
  config = {},
  dryRun = true,
  specDb = null,
}) {
  const scan = await scanOrphans({ storage, category, config, specDb });

  if (scan.orphan_count === 0) {
    return {
      command: 'product-reconcile',
      category,
      dry_run: dryRun,
      ...scan,
      deleted_count: 0,
      deleted: [],
      queue_cleaned: 0
    };
  }

  const deleted = [];
  let queueCleaned = 0;

  if (!dryRun) {
    // Load queue state once for batch removal
    const loaded = await loadQueueState({ storage, category, specDb });
    let queueChanged = false;

    for (const orphan of scan.orphans) {
      // Delete the product input file
      await storage.deleteObject(orphan.key);
      deleted.push({
        productId: orphan.productId,
        key: orphan.key,
        canonicalProductId: orphan.canonicalProductId
      });

      // Remove from queue if present
      if (loaded.state.products?.[orphan.productId]) {
        delete loaded.state.products[orphan.productId];
        queueCleaned += 1;
        queueChanged = true;
      }
    }

    if (queueChanged) {
      await saveQueueState({ storage, category, state: loaded.state, specDb });
    }
  }

  return {
    command: 'product-reconcile',
    category,
    dry_run: dryRun,
    total_scanned: scan.total_scanned,
    canonical_count: scan.canonical_count,
    orphan_count: scan.orphan_count,
    warning_count: scan.warning_count,
    untracked_count: scan.untracked_count || 0,
    deleted_count: dryRun ? 0 : deleted.length,
    deleted: dryRun ? scan.orphans.map(o => ({
      productId: o.productId,
      key: o.key,
      canonicalProductId: o.canonicalProductId,
      would_delete: true
    })) : deleted,
    warnings: scan.warnings,
    untracked: scan.untracked || [],
    queue_cleaned: queueCleaned
  };
}
