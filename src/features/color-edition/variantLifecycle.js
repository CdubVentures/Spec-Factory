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

function getColorVariantCombo(variant) {
  return String(variant?.variant_key || '').replace(/^color:/, '');
}

function getEditionColorCombo(variant) {
  const atoms = Array.isArray(variant?.color_atoms)
    ? variant.color_atoms.filter(atom => typeof atom === 'string' && atom.length > 0)
    : [];
  return atoms.join('+');
}

// ── Derive display names from variant table (pure) ─────────────────

/**
 * Build color_names and edition_details maps from the variants table.
 *
 * WHY: GET response must derive these from variants (SSOT), not from
 * selected (run snapshot). selected is audit/LLM feed-forward only.
 *
 * @param {object[]} variants — rows from variants.listActive or listByProduct
 * @param {string[]} publishedColors — atoms currently in the summary table
 * @param {string[]} publishedEditions — slugs currently in the summary table
 * @returns {{ colorNames: Record<string, string>, editionDetails: Record<string, { display_name: string, colors: string[] }> }}
 */
export function deriveColorNamesFromVariants(variants, publishedColors, publishedEditions) {
  const colorSet = new Set(publishedColors);
  const editionSet = new Set(publishedEditions);
  const colorNames = {};
  const editionDetails = {};

  for (const v of variants) {
    if (v.variant_type === 'color' && v.variant_label) {
      // WHY: Use combo string from variant_key, not individual atoms.
      // Published colors are combo strings (e.g. "white+silver"), not split atoms.
      const combo = getColorVariantCombo(v);
      if (combo && colorSet.has(combo)) {
        colorNames[combo] = v.variant_label;
      }
    } else if (v.variant_type === 'edition' && v.edition_slug && editionSet.has(v.edition_slug)) {
      // WHY: color_atoms stores split atoms ["black","gray","orange"], but
      // selected.editions stored combo strings ["black+gray+orange"].
      // Frontend iterates .colors and renders each entry as a color pill,
      // so we must re-join to preserve the combo display.
      const combo = getEditionColorCombo(v);
      editionDetails[v.edition_slug] = {
        display_name: v.edition_display_name || v.edition_slug,
        colors: combo ? [combo] : [],
      };
    }
  }

  return { colorNames, editionDetails };
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
      // WHY: Publish the combo string (e.g. "white+silver"), not individual atoms.
      // Atom splitting is only for palette validation. The combo is the variant key
      // and the contract buildVariantList / PIF depend on.
      const combo = getColorVariantCombo(v);
      if (combo && !colors.includes(combo)) colors.push(combo);
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
        // WHY: Use combo string from variant_key, not split atoms from color_atoms.
        // Must match derivePublishedFromVariants so rebuild produces correct state.
        const combo = getColorVariantCombo(v);
        if (combo && !colors.includes(combo)) colors.push(combo);
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
function stripVariantFromCandidates({ specDb, productId, variant, productRoot }) {
  // Determine which fields and values this variant contributes
  const strips = [];

  if (variant.variant_type === 'color') {
    // WHY: Use combo string from variant_key, not split atoms from color_atoms.
    // Candidates store combo strings (e.g. "white+silver"), not individual atoms.
    const combo = getColorVariantCombo(variant);
    if (combo) strips.push({ fieldKey: 'colors', values: [combo] });
  } else if (variant.variant_type === 'edition') {
    if (variant.edition_slug) {
      strips.push({ fieldKey: 'editions', values: [variant.edition_slug] });
    }
    // WHY: CEF colors candidates store the edition colorway as one combo string
    // (e.g. "dark-gray+black+orange"), not split atoms. Delete must strip that
    // canonical stored value or the row survives with stale evidence.
    const combo = getEditionColorCombo(variant);
    if (combo) {
      strips.push({ fieldKey: 'colors', values: [combo] });
    }
  }

  for (const { fieldKey, values } of strips) {
    if (values.length === 0) continue;
    const removeSet = new Set(values);
    const candidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);

    for (const row of candidates) {
      // WHY: Only strip from CEF-sourced candidates. Pipeline/feature sources
      // may independently discover the same color — that evidence is unrelated
      // to the variant entity and must not be touched.
      if (row.source_type !== 'cef') continue;

      let parsed;
      try { parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { continue; }
      if (!Array.isArray(parsed)) continue;

      const filtered = parsed.filter(item => !removeSet.has(item));
      if (filtered.length === parsed.length) continue;

      // WHY: Candidate rows are audit/evidence. Variant delete strips matching
      // values but never deletes the row — even when the array becomes empty.
      // Rows are only deleted on explicit candidate-delete or source/run delete.
      specDb.updateFieldCandidateValue(productId, fieldKey, row.source_id, JSON.stringify(filtered));
    }
  }

  // WHY: product.json.candidates must stay in sync with SQL (dual-write).
  // Candidate values can be parsed arrays or stringified JSON strings.
  const productJson = readProductJson(productRoot, productId);
  if (productJson?.candidates) {
    let jsonChanged = false;
    for (const { fieldKey, values } of strips) {
      if (values.length === 0) continue;
      const removeSet = new Set(values);
      const entries = productJson.candidates[fieldKey];
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        // WHY: Same CEF-only scoping as SQL — only strip from CEF sources.
        if (entry.source_type !== 'cef') continue;

        let parsed;
        try { parsed = typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value; }
        catch { continue; }
        if (!Array.isArray(parsed)) continue;

        const filtered = parsed.filter(item => !removeSet.has(item));
        if (filtered.length === parsed.length) continue;
        jsonChanged = true;

        // WHY: Mirrors the SQL rule — strip values, keep the row. Empty arrays
        // are valid evidence state ("source once had values, now has none").
        entry.value = filtered;
      }
    }
    if (jsonChanged) {
      productJson.updated_at = new Date().toISOString();
      writeProductJson(productRoot, productId, productJson);
    }
  }
}

// ── Variant-id FK cascade for feature-source candidates ────────────

/**
 * Delete all field_candidates anchored to a variant_id (SQL + JSON).
 *
 * WHY: Feature-source candidates (price, SKU, release date) carry the
 * variant_id as the FK anchor. When a variant is deleted, every row keyed
 * to that id must go — both in SQL and in the product.json mirror.
 *
 * NULL variant_id rows (CEF-source, pipeline) are NOT touched here —
 * those go through stripVariantFromCandidates value matching.
 */
function cascadeVariantIdFromCandidates({ specDb, productId, variantId, productRoot }) {
  if (!variantId) return;

  specDb.deleteFieldCandidatesByVariantId(productId, variantId);

  const productJson = readProductJson(productRoot, productId);
  if (!productJson?.candidates) return;

  let jsonChanged = false;
  for (const [fieldKey, entries] of Object.entries(productJson.candidates)) {
    if (!Array.isArray(entries)) continue;

    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]?.variant_id === variantId) {
        entries.splice(i, 1);
        jsonChanged = true;
      }
    }

    if (entries.length === 0) delete productJson.candidates[fieldKey];
  }

  if (jsonChanged) {
    productJson.updated_at = new Date().toISOString();
    writeProductJson(productRoot, productId, productJson);
  }
}

// ── Delete variant + cascade ────────────────────────────────────────

/**
 * Delete a variant and cascade to all dependent systems.
 *
 * Cascade:
 *   1. variants table → hard delete
 *   2. field_candidates (CEF source) → strip variant's contributed values from arrays
 *   3. field_candidates (feature source) → DELETE WHERE variant_id = ? (FK cascade)
 *   4. color_edition.json variant_registry + selected → filter out
 *   5. published state → re-derive from remaining variants
 *   6. PIF → remove images, evals, carousel_slots for this variant
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

  // 2. Strip variant's values from CEF-source field_candidates (SQL + JSON)
  stripVariantFromCandidates({ specDb, productId, variant, productRoot });

  // 3. Cascade variant-anchored feature-source candidates by variant_id (SQL + JSON)
  cascadeVariantIdFromCandidates({ specDb, productId, variantId, productRoot });

  // 4. Remove from JSON SSOT
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

// ── Delete all variants + cascade ─────────────────────────────────

/**
 * Delete all active variants for a product. Loops deleteVariant per variant.
 *
 * WHY: "Delete all variants" is a separate operation from "delete all runs".
 * Runs = discovery history. Variants = the entity layer. This deletes the
 * entity layer and everything downstream (candidates, PIF, published state).
 *
 * @param {{ specDb, productId: string, productRoot?: string }} opts
 * @returns {{ deleted: number, variants: object[] }}
 */
export function deleteAllVariants({ specDb, productId, productRoot }) {
  productRoot = productRoot || defaultProductRoot();
  const active = specDb.variants.listActive(productId);
  if (active.length === 0) return { deleted: 0, variants: [] };

  const deleted = [];
  for (const v of active) {
    const result = deleteVariant({ specDb, productId, variantId: v.variant_id, productRoot });
    if (result.deleted) deleted.push(result.variant);
  }

  return { deleted: deleted.length, variants: deleted };
}
