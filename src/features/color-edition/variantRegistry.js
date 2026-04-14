/**
 * Variant Registry — stable identity for CEF color/edition variants.
 *
 * Each variant gets a permanent hash (v_<8-hex>) assigned once at publish time.
 * The hash never changes, even if the variant's name, color atoms, or display
 * label are updated in later CEF runs.
 *
 * Phase 1: write-once registry. Phase 2 adds LLM validation for updates.
 */

import crypto from 'node:crypto';

/**
 * Generate a stable variant ID from product + variant key.
 *
 * WHY: 8 hex chars = 32 bits ≈ 4.3 billion combinations. Combined with
 * product_id scoping, collision is effectively impossible for our catalog sizes.
 *
 * @param {string} productId
 * @param {string} variantKey — e.g. 'color:black' or 'edition:cod-bo6'
 * @returns {string} — format: v_<8-hex>
 */
export function generateVariantId(productId, variantKey) {
  const input = `${productId}:${variantKey}`;
  return 'v_' + crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Build a full variant registry from CEF selected data.
 *
 * Mirrors buildVariantList logic (src/features/product-image/productImageFinder.js)
 * but produces registry entries with stable IDs instead of plain key/label/type.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string[]} [opts.colors] — color atom strings
 * @param {Record<string, string>} [opts.colorNames] — atom → marketing name
 * @param {Record<string, {display_name?: string, colors?: string[]}>} [opts.editions]
 * @returns {Array<object>} — variant registry entries
 */
export function buildVariantRegistry({ productId, colors = [], colorNames = {}, editions = {} }) {
  const now = new Date().toISOString();

  // WHY: Same reverse lookup as buildVariantList — maps edition combo string
  // to its slug so we can detect which colors[] entries are edition combos.
  const comboToEdition = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo) comboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
  }

  const registry = [];
  const seenEditionSlugs = new Set();

  for (const entry of colors) {
    const edition = comboToEdition.get(entry);
    if (edition) {
      seenEditionSlugs.add(edition.slug);
      const variantKey = `edition:${edition.slug}`;
      registry.push({
        variant_id: generateVariantId(productId, variantKey),
        variant_key: variantKey,
        variant_type: 'edition',
        variant_label: edition.displayName,
        color_atoms: entry.split('+').filter(Boolean),
        edition_slug: edition.slug,
        edition_display_name: edition.displayName,
        created_at: now,
      });
    } else {
      const name = colorNames[entry];
      const hasName = name && name.toLowerCase() !== entry.toLowerCase();
      const variantKey = `color:${entry}`;
      registry.push({
        variant_id: generateVariantId(productId, variantKey),
        variant_key: variantKey,
        variant_type: 'color',
        variant_label: hasName ? name : entry,
        color_atoms: entry.split('+').filter(Boolean),
        edition_slug: null,
        edition_display_name: null,
        created_at: now,
      });
    }
  }

  // WHY: Editions whose combo is NOT in the colors array still need registry entries.
  for (const [slug, ed] of Object.entries(editions)) {
    if (seenEditionSlugs.has(slug)) continue;
    const combo = (ed.colors || [])[0] || '';
    const displayName = ed.display_name || slug;
    const variantKey = `edition:${slug}`;
    registry.push({
      variant_id: generateVariantId(productId, variantKey),
      variant_key: variantKey,
      variant_type: 'edition',
      variant_label: displayName,
      color_atoms: combo ? combo.split('+').filter(Boolean) : [],
      edition_slug: slug,
      edition_display_name: displayName,
      created_at: now,
    });
  }

  return registry;
}

/**
 * Apply LLM identity check mappings to an existing variant registry.
 *
 * WHY: On Run 2+, the LLM compares new discoveries against the existing
 * registry. Each mapping says "this new key matches existing variant X"
 * (update) or "this is genuinely new" (create). Retired entries are marked
 * but never removed — PIF images may still reference them.
 *
 * @param {object} opts
 * @param {Array} opts.existingRegistry — current variant_registry array
 * @param {Array<{new_key, match, action, reason}>} opts.mappings — LLM output
 * @param {string[]} opts.retired — variant_ids no longer in discoveries
 * @param {string} opts.productId
 * @param {string[]} opts.colors — new discovery colors
 * @param {Record<string, string>} opts.colorNames — new discovery color names
 * @param {Record<string, object>} opts.editions — new discovery editions
 * @returns {Array} — updated registry array
 */
export function applyIdentityMappings({ existingRegistry, mappings, retired, productId, colors = [], colorNames = {}, editions = {} }) {
  const now = new Date().toISOString();
  const registry = existingRegistry.map((e) => ({ ...e }));
  const byId = new Map(registry.map((e) => [e.variant_id, e]));

  // WHY: Same reverse lookup as buildVariantRegistry — maps edition combo → slug
  const comboToEdition = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo) comboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
  }

  for (const mapping of mappings) {
    if (mapping.action === 'update' && mapping.match) {
      const entry = byId.get(mapping.match);
      if (!entry) continue;

      // WHY: Update mutable fields, preserve variant_id + variant_type + created_at
      const newKey = mapping.new_key;
      entry.variant_key = newKey;
      entry.updated_at = now;

      if (newKey.startsWith('edition:')) {
        const slug = newKey.replace('edition:', '');
        const ed = editions[slug];
        const combo = (ed?.colors || [])[0] || '';
        entry.variant_label = ed?.display_name || slug;
        entry.color_atoms = combo ? combo.split('+').filter(Boolean) : [];
        entry.edition_slug = slug;
        entry.edition_display_name = ed?.display_name || slug;
      } else {
        const atom = newKey.replace('color:', '');
        const name = colorNames[atom];
        const hasName = name && name.toLowerCase() !== atom.toLowerCase();
        entry.variant_label = hasName ? name : atom;
        entry.color_atoms = atom.split('+').filter(Boolean);
      }
    } else if (mapping.action === 'create') {
      const newKey = mapping.new_key;
      const variantId = generateVariantId(productId, newKey);

      if (newKey.startsWith('edition:')) {
        const slug = newKey.replace('edition:', '');
        const ed = editions[slug];
        const combo = (ed?.colors || [])[0] || '';
        registry.push({
          variant_id: variantId,
          variant_key: newKey,
          variant_type: 'edition',
          variant_label: ed?.display_name || slug,
          color_atoms: combo ? combo.split('+').filter(Boolean) : [],
          edition_slug: slug,
          edition_display_name: ed?.display_name || slug,
          created_at: now,
        });
      } else {
        const atom = newKey.replace('color:', '');
        const name = colorNames[atom];
        const hasName = name && name.toLowerCase() !== atom.toLowerCase();
        registry.push({
          variant_id: variantId,
          variant_key: newKey,
          variant_type: 'color',
          variant_label: hasName ? name : atom,
          color_atoms: atom.split('+').filter(Boolean),
          edition_slug: null,
          edition_display_name: null,
          created_at: now,
        });
      }
    }
  }

  // WHY: Retired variants stay in registry — PIF images may reference them.
  const retiredSet = new Set(retired || []);
  for (const entry of registry) {
    if (retiredSet.has(entry.variant_id)) {
      entry.retired = true;
    }
  }

  return registry;
}
