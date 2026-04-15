/**
 * Variant Lifecycle — derive published state + deletion cascade.
 *
 * WHY: Variants are the SSOT for published colors/editions. This module
 * derives the published state from the variants table and cascades
 * variant deletion to PIF, product.json, and CEF JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { readColorEdition, writeColorEdition } from './colorEditionStore.js';
import { propagateVariantDelete } from '../product-image/index.js';

// ── Helpers ─────────────────────────────────────────────────────────

function readProductJson(productRoot, productId) {
  try {
    const filePath = path.join(productRoot, productId, 'product.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeProductJson(productRoot, productId, data) {
  const filePath = path.join(productRoot, productId, 'product.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Derive published state from variants ────────────────────────────

/**
 * Read active variants → build published colors/editions → write to
 * product.json fields[] and CEF summary columns.
 *
 * WHY: Replaces candidate set_union for colors/editions. The variants
 * table is the SSOT; this function projects it into the published state.
 *
 * @param {{ specDb, productId: string, productRoot?: string }} opts
 * @returns {{ colors: string[], editions: string[], defaultColor: string }}
 */
export function derivePublishedFromVariants({ specDb, productId, productRoot }) {
  productRoot = productRoot || defaultProductRoot();
  const variants = specDb.variants.listActive(productId);

  const colors = [];
  const editions = [];

  for (const v of variants) {
    if (v.variant_type === 'color') {
      for (const atom of v.color_atoms) {
        if (!colors.includes(atom)) colors.push(atom);
      }
    } else if (v.variant_type === 'edition') {
      if (v.edition_slug && !editions.includes(v.edition_slug)) {
        editions.push(v.edition_slug);
      }
      // WHY: Edition color_atoms describe the colorway composition (e.g., dark-gray+black+orange).
      // They must NOT be promoted to standalone published colors.
    }
  }

  const defaultColor = colors[0] || '';
  const now = new Date().toISOString();

  // Update product.json fields[colors] and fields[editions]
  const productJson = readProductJson(productRoot, productId);
  if (productJson) {
    if (!productJson.fields) productJson.fields = {};

    if (colors.length > 0) {
      productJson.fields.colors = {
        value: colors,
        confidence: 1.0,
        source: 'variant_registry',
        resolved_at: now,
        sources: [{ source: 'variant_registry' }],
      };
    } else {
      delete productJson.fields.colors;
    }

    if (editions.length > 0) {
      productJson.fields.editions = {
        value: editions,
        confidence: 1.0,
        source: 'variant_registry',
        resolved_at: now,
        sources: [{ source: 'variant_registry' }],
      };
    } else {
      delete productJson.fields.editions;
    }

    productJson.updated_at = now;
    writeProductJson(productRoot, productId, productJson);
  }

  // Update CEF summary columns (targeted — preserves other columns)
  const finderStore = specDb.getFinderStore?.('colorEditionFinder');
  if (finderStore) {
    finderStore.updateSummaryField(productId, 'colors', JSON.stringify(colors));
    finderStore.updateSummaryField(productId, 'editions', JSON.stringify(editions));
    finderStore.updateSummaryField(productId, 'default_color', defaultColor);
  }

  return { colors, editions, defaultColor };
}

// ── Remove variant from JSON SSOT ───────────────────────────────────

function removeVariantFromJson({ productId, variantId, productRoot }) {
  const data = readColorEdition({ productId, productRoot });
  if (!data || !Array.isArray(data.variant_registry)) return;

  const before = data.variant_registry.length;
  data.variant_registry = data.variant_registry.filter(e => e.variant_id !== variantId);
  if (data.variant_registry.length === before) return;

  // WHY: Keep selected.* consistent with variant_registry for rebuild correctness.
  // JSON is durable memory — rebuild reads selected.* to seed the summary table.
  if (data.selected) {
    const remaining = data.variant_registry;
    const colors = [];
    const editions = {};
    for (const v of remaining) {
      if (v.variant_type === 'color') {
        for (const atom of (v.color_atoms || [])) {
          if (!colors.includes(atom)) colors.push(atom);
        }
      } else if (v.variant_type === 'edition') {
        // WHY: Preserve edition detail from existing selected if available
        const slug = v.edition_slug;
        if (slug) {
          editions[slug] = data.selected.editions?.[slug] || { display_name: v.edition_display_name || slug };
          // WHY: Edition color_atoms stay scoped to the edition — NOT promoted to selected.colors
        }
      }
    }
    data.selected.colors = colors;
    data.selected.editions = editions;
    data.selected.default_color = colors[0] || '';
  }

  writeColorEdition({ productId, productRoot, data });
}

// ── Strip variant values from candidates ────────────────────────────

/**
 * Remove a variant's contributed values from all field_candidates.
 *
 * WHY: When a variant is deleted, its values should be removed from every
 * candidate's array so they can't resurface via republish/set_union.
 * Candidates are evidence — but evidence of a deleted variant is invalid.
 *
 * Pattern 1 (array fields): splice items from JSON array values.
 * Pattern 2 (FK fields, future): handled by FK cascade — not here.
 *
 * @param {{ specDb, productId: string, variant: object }} opts
 */
function stripVariantFromCandidates({ specDb, productId, variant }) {
  // Determine which fields and values this variant contributes
  const strips = [];

  if (variant.variant_type === 'color') {
    strips.push({ fieldKey: 'colors', values: variant.color_atoms || [] });
  } else if (variant.variant_type === 'edition') {
    if (variant.edition_slug) {
      strips.push({ fieldKey: 'editions', values: [variant.edition_slug] });
    }
    // Edition atoms also appear in the colors field
    if (variant.color_atoms?.length > 0) {
      strips.push({ fieldKey: 'colors', values: variant.color_atoms });
    }
  }

  for (const { fieldKey, values } of strips) {
    if (values.length === 0) continue;
    const removeSet = new Set(values);
    const candidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);

    for (const row of candidates) {
      let parsed;
      try { parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { continue; }
      if (!Array.isArray(parsed)) continue;

      const filtered = parsed.filter(item => !removeSet.has(item));
      if (filtered.length === parsed.length) continue;

      if (filtered.length === 0) {
        // WHY: Empty array = candidate has no valid values left. Delete it.
        specDb.deleteFieldCandidateBySourceId(productId, fieldKey, row.source_id);
      } else {
        specDb.updateFieldCandidateValue(productId, fieldKey, row.source_id, JSON.stringify(filtered));
      }
    }
  }
}

// ── Delete variant + cascade ────────────────────────────────────────

/**
 * Delete a variant and cascade to all dependent systems.
 *
 * Cascade:
 *   1. variants table → hard delete
 *   2. field_candidates → strip variant's contributed values from arrays
 *   3. color_edition.json variant_registry + selected → filter out
 *   4. published state → re-derive from remaining variants
 *   5. PIF → remove images, evals, carousel_slots for this variant
 *
 * @param {{ specDb, productId: string, variantId: string, productRoot?: string }} opts
 * @returns {{ deleted: boolean, variant?: object }}
 */
export function deleteVariant({ specDb, productId, variantId, productRoot }) {
  productRoot = productRoot || defaultProductRoot();
  const variant = specDb.variants.get(productId, variantId);
  if (!variant) return { deleted: false };

  // 1. Remove from variants table
  specDb.variants.remove(productId, variantId);

  // 2. Strip variant's values from all field_candidates
  stripVariantFromCandidates({ specDb, productId, variant });

  // 3. Remove from JSON SSOT
  removeVariantFromJson({ productId, variantId, productRoot });

  // 4. Re-derive published state from remaining variants
  const published = derivePublishedFromVariants({ specDb, productId, productRoot });

  // 5. Cascade to PIF
  const pifResult = propagateVariantDelete({
    productId,
    variantId: variant.variant_id,
    variantKey: variant.variant_key,
    productRoot,
    specDb,
  });

  return { deleted: true, variant, published, pif: pifResult };
}
