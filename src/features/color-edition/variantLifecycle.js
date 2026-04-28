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
import { FINDER_MODULES } from '../../core/finder/finderModuleRegistry.js';
import { stripVariantFromFieldProducerHistory } from '../../core/finder/variantCleanup.js';
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

/**
 * Aggregate CEF-source candidate confidence for a field across active variants.
 *
 * Reads field_candidates (the SSOT for confidence — written by submitCandidate
 * when CEF publishes a per-variant candidate) and aggregates with min():
 * a field's overall confidence is only as strong as its weakest accepted
 * variant. No caller should ever stamp 1.0 here — use this helper.
 *
 * @param {object} specDb
 * @param {string} productId
 * @param {'colors'|'editions'} fieldKey
 * @param {object[]} activeVariants — rows from variants.listActive
 * @returns {number} min per-variant confidence, or 0 when no CEF candidates exist
 */
export function aggregateCefFieldConfidence(specDb, productId, fieldKey, activeVariants) {
  if (!specDb?.getFieldCandidatesByProductAndField || !Array.isArray(activeVariants) || activeVariants.length === 0) {
    return 0;
  }
  const activeIds = new Set(activeVariants.map((v) => v.variant_id).filter(Boolean));
  if (activeIds.size === 0) return 0;
  const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey) || [];
  const perVariant = new Map();
  for (const r of rows) {
    if (r?.source_type !== 'cef') continue;
    if (!activeIds.has(r.variant_id)) continue;
    const conf = Number(r.confidence);
    if (!Number.isFinite(conf)) continue;
    const existing = perVariant.get(r.variant_id);
    if (existing == null || conf > existing) perVariant.set(r.variant_id, conf);
  }
  if (perVariant.size === 0) return 0;
  return Math.min(...perVariant.values());
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
 * Pure: project a list of variant rows into published colors/editions arrays.
 *
 * WHY: Variants are the SSOT for colors/editions. This helper is the
 * single place that knows how to turn variant rows into published arrays;
 * reused by both the write path (derivePublishedFromVariants) and the
 * read path (publisher GET /published/:productId).
 *
 * Rules:
 *  - Color variants contribute their combo (e.g. "white+silver") to colors.
 *  - Edition variants contribute their slug to editions AND their combo to
 *    colors (an edition IS a color variant).
 *  - Combos stay intact — never split into atoms.
 *
 * @param {object[]} variants — rows from variants.listActive
 * @returns {{ colors: string[], editions: string[], defaultColor: string }}
 */
export function computePublishedArraysFromVariants(variants) {
  const colors = [];
  const editions = [];

  for (const v of variants || []) {
    if (v.variant_type === 'color') {
      const combo = getColorVariantCombo(v);
      if (combo && !colors.includes(combo)) colors.push(combo);
    } else if (v.variant_type === 'edition') {
      if (v.edition_slug && !editions.includes(v.edition_slug)) {
        editions.push(v.edition_slug);
      }
      const editionCombo = getEditionColorCombo(v);
      if (editionCombo && !colors.includes(editionCombo)) colors.push(editionCombo);
    }
  }

  return { colors, editions, defaultColor: colors[0] || '' };
}

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
function computePublishedProjection({ specDb, productId }) {
  const variants = specDb.variants.listActive(productId);
  const { colors, editions, defaultColor } = computePublishedArraysFromVariants(variants);
  return {
    colors,
    editions,
    defaultColor,
    colorsConfidence: aggregateCefFieldConfidence(specDb, productId, 'colors', variants),
    editionsConfidence: aggregateCefFieldConfidence(specDb, productId, 'editions', variants),
    now: new Date().toISOString(),
  };
}

function writePublishedSql({ specDb, productId, projection }) {
  const finderStore = specDb.getFinderStore?.('colorEditionFinder');
  if (finderStore) {
    finderStore.updateSummaryField(productId, 'colors', JSON.stringify(projection.colors));
    finderStore.updateSummaryField(productId, 'editions', JSON.stringify(projection.editions));
    finderStore.updateSummaryField(productId, 'default_color', projection.defaultColor);
  }
}

function mirrorPublishedProductJson({ productRoot, productId, projection }) {
  // Mirror product.json fields[colors] and fields[editions]
  const productJson = readProductJson(productRoot, productId);
  if (productJson) {
    if (!productJson.fields) productJson.fields = {};

    if (projection.colors.length > 0) {
      productJson.fields.colors = {
        value: projection.colors,
        confidence: projection.colorsConfidence,
        source: 'variant_registry',
        resolved_at: projection.now,
        sources: [{ source: 'variant_registry' }],
      };
    } else {
      delete productJson.fields.colors;
    }

    if (projection.editions.length > 0) {
      productJson.fields.editions = {
        value: projection.editions,
        confidence: projection.editionsConfidence,
        source: 'variant_registry',
        resolved_at: projection.now,
        sources: [{ source: 'variant_registry' }],
      };
    } else {
      delete productJson.fields.editions;
    }

    productJson.updated_at = projection.now;
    writeProductJson(productRoot, productId, productJson);
  }
}

function publishedResult(projection) {
  return {
    colors: projection.colors,
    editions: projection.editions,
    defaultColor: projection.defaultColor,
  };
}

export function derivePublishedFromVariants({ specDb, productId, productRoot }) {
  productRoot = productRoot || defaultProductRoot();
  const projection = computePublishedProjection({ specDb, productId });
  writePublishedSql({ specDb, productId, projection });
  mirrorPublishedProductJson({ productRoot, productId, projection });

  return publishedResult(projection);
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
function getVariantCandidateStrips(variant) {
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
  return strips;
}

function stripVariantFromCandidateSql({ specDb, productId, strips }) {
  for (const { fieldKey, values } of strips) {
    if (values.length === 0) continue;
    const removeSet = new Set(values);
    const candidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);

    for (const row of candidates) {
      // WHY: Only strip from CEF-sourced candidates. Pipeline/feature sources
      // may independently discover the same color — that evidence is unrelated
      // to the variant entity and must not be touched.
      if (row.source_type !== 'cef') continue;

      // WHY: Per-variant rows (variant_id set) cascade via cascadeVariantIdFromCandidates.
      // This legacy array-splice path only applies to pre-per-variant rows where the
      // value is a multi-item array and variant_id is null. Skipping here prevents
      // cross-variant clobber (updateValue keys on source_id, which is shared across
      // all variants within a single CEF run).
      if (row.variant_id) continue;

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
}

function stripVariantFromCandidateJson({ productId, productRoot, strips }) {
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
function cascadeVariantIdFromCandidateSql({ specDb, productId, variantId }) {
  if (!variantId) return;
  specDb.deleteFieldCandidatesByVariantId(productId, variantId);
}

function cascadeVariantIdFromCandidateJson({ productId, variantId, productRoot }) {
  if (!variantId) return;
  const productJson = readProductJson(productRoot, productId);
  if (!productJson) return;

  let jsonChanged = false;

  // Strip variant_id-anchored candidates from product.json.candidates[]
  if (productJson.candidates) {
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
  }

  // WHY: Variant-scoped published values live in variant_fields[vid][fieldKey].
  // Delete-variant must drop the whole variant_fields[vid] entry — otherwise the
  // published release_date / SKU / price for a non-existent variant persists.
  if (productJson.variant_fields && productJson.variant_fields[variantId]) {
    delete productJson.variant_fields[variantId];
    jsonChanged = true;
    if (Object.keys(productJson.variant_fields).length === 0) {
      delete productJson.variant_fields;
    }
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
 *   6. PIF (variantArtifactProducer) → remove images, evals, carousel_slots for this variant
 *   7. Every variantFieldProducer module (RDF, and future SKU/price/etc.)
 *      → strip per-variant entries from its own JSON runs + SQL summary/runs blobs.
 *      Driven by finderModuleRegistry so new modules auto-inherit the cascade.
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

  const candidateStrips = getVariantCandidateStrips(variant);

  // 2. Strip variant values from CEF-source field_candidates in SQL.
  stripVariantFromCandidateSql({ specDb, productId, strips: candidateStrips });

  // 3. Delete variant-anchored feature-source candidates in SQL.
  cascadeVariantIdFromCandidateSql({ specDb, productId, variantId });

  // 4. Re-derive published SQL from remaining variants before JSON mirrors.
  const publishedProjection = computePublishedProjection({ specDb, productId });
  writePublishedSql({ specDb, productId, projection: publishedProjection });
  const published = publishedResult(publishedProjection);

  // 5. Mirror local candidate cleanup to product.json after SQL cascade.
  stripVariantFromCandidateJson({ productId, productRoot, strips: candidateStrips });
  cascadeVariantIdFromCandidateJson({ productId, variantId, productRoot });

  // 6. Remove from JSON SSOT
  removeVariantFromJson({ productId, variantId, productRoot });

  // 7. Mirror published product.json fields from the SQL-projected state.
  mirrorPublishedProductJson({ productRoot, productId, projection: publishedProjection });

  // 8. Cascade to PIF (variantArtifactProducer - custom disk + eval cleanup)
  const pifResult = propagateVariantDelete({
    productId,
    variantId: variant.variant_id,
    variantKey: variant.variant_key,
    productRoot,
    specDb,
  });

  // 9. Generic cascade: every variantFieldProducer module strips its own history.
  // O(1) scaling: a new variantFieldProducer entry in finderModuleRegistry
  // automatically gets this cleanup — no edits here required.
  const fieldProducerResults = {};
  for (const mod of FINDER_MODULES) {
    if (mod.moduleClass !== 'variantFieldProducer') continue;
    fieldProducerResults[mod.id] = stripVariantFromFieldProducerHistory({
      specDb, productId,
      variantId: variant.variant_id,
      variantKey: variant.variant_key,
      module: mod,
      productRoot,
    });
  }

  return { deleted: true, variant, published, pif: pifResult, fieldProducers: fieldProducerResults };
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
