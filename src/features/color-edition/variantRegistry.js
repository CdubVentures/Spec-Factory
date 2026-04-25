/**
 * Variant Registry — stable identity for CEF color/edition variants.
 *
 * Each variant gets a permanent hash (v_<8-hex>) assigned once at publish time.
 * The hash never changes, even if the variant's name, color atoms, or display
 * label are updated in later CEF runs.
 *
 * Two-gate validation:
 * - Gate 1 (validateColorsAgainstPalette): every atom must exist in registered palette
 * - Gate 2 (validateIdentityMappings): no duplicate matches, no slug changes, valid atoms
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

  // WHY: Only MULTI-ATOM combos dedupe against editions. The CEF prompt requires
  // every edition's combo entry to also appear in colors[] — for multi-atom
  // combos like "black+red+yellow", that entry IS the edition, so we collapse.
  // Single-atom entries are always plain colorways: "black" is the base black
  // colorway, not the same thing as an edition that happens to be black-bodied.
  // Pre-fix regression (M75 Wireless): single-atom editions absorbed the plain
  // color entry, losing a variant and routing edition URLs onto the plain color.
  const multiAtomComboToEdition = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo && combo.includes('+')) {
      multiAtomComboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
    }
  }

  const registry = [];
  const seenEditionSlugs = new Set();

  for (const entry of colors) {
    const edition = multiAtomComboToEdition.get(entry);
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

  // WHY: All editions not already collapsed via a multi-atom combo get their
  // own entry here. Single-atom editions always land here (since they never
  // dedupe against plain colors), as do editions whose combo was never listed
  // in colors[].
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

/* ── Gate 1: Palette validation ────────────────────────────────── */

/**
 * Validate that every color atom in colors and edition combos exists
 * in the registered color palette. One unknown atom → invalid (tainted batch).
 *
 * @param {object} opts
 * @param {string[]} opts.colors — color atom strings from LLM 1
 * @param {Record<string, {colors?: string[]}>} opts.editions — edition objects
 * @param {string[]} opts.palette — registered color names from appDb.listColors()
 * @returns {{ valid: boolean, reason: string | null, unknownAtoms: string[] }}
 */
export function validateColorsAgainstPalette({ colors = [], editions = {}, palette = [] }) {
  const paletteSet = new Set(palette.map((n) => n.toLowerCase()));
  const unknownAtoms = [];

  const checkAtoms = (atomStr) => {
    for (const atom of atomStr.split('+').filter(Boolean)) {
      if (!paletteSet.has(atom.toLowerCase())) {
        unknownAtoms.push(atom);
      }
    }
  };

  for (const color of colors) checkAtoms(color);
  for (const ed of Object.values(editions)) {
    for (const combo of ed.colors || []) checkAtoms(combo);
  }

  if (unknownAtoms.length > 0) {
    const unique = [...new Set(unknownAtoms)];
    return {
      valid: false,
      reason: `Unknown color atom "${unique[0]}" — not in registered palette`,
      unknownAtoms: unique,
    };
  }

  return { valid: true, reason: null, unknownAtoms: [] };
}

/* ── Gate 2: Identity check validation ─────────────────────────── */

/**
 * Validate identity check mappings before applying them to the registry.
 * Any failure → whole run rejected.
 *
 * @param {object} opts
 * @param {Array<{new_key, match, action, reason}>} opts.mappings
 * @param {Array} opts.existingRegistry — current variant_registry entries
 * @param {string[]} opts.palette — registered color names
 * @returns {{ valid: boolean, reason: string | null }}
 */
export function validateIdentityMappings({ mappings = [], existingRegistry = [], palette = [] }) {
  const paletteSet = new Set(palette.map((n) => n.toLowerCase()));
  const byId = new Map(existingRegistry.map((e) => [e.variant_id, e]));
  const matchTargets = new Set();

  for (const m of mappings) {
    if (Array.isArray(m.preferred_color_atoms)) {
      if (m.preferred_color_atoms.length === 0) {
        return { valid: false, reason: `preferred_color_atoms cannot be empty for "${m.new_key}"` };
      }
      for (const atom of m.preferred_color_atoms) {
        if (!paletteSet.has(atom.toLowerCase())) {
          return { valid: false, reason: `Unknown color atom "${atom}" in preferred_color_atoms for "${m.new_key}"` };
        }
      }
    }

    // WHY: match action must have a non-null match field (variant_id reference)
    if (m.action === 'match') {
      if (!m.match) {
        return { valid: false, reason: `match action missing variant_id for "${m.new_key}"` };
      }

      // WHY: No two match actions may reference the same variant_id
      if (matchTargets.has(m.match)) {
        return { valid: false, reason: `Duplicate match target: ${m.match} claimed by 2 discoveries` };
      }
      matchTargets.add(m.match);

      // WHY: Edition slugs are structural identity — they must never change
      const existingEntry = byId.get(m.match);
      if (existingEntry && existingEntry.variant_type === 'edition' && m.new_key.startsWith('edition:')) {
        const newSlug = m.new_key.replace('edition:', '');
        if (existingEntry.edition_slug && newSlug !== existingEntry.edition_slug) {
          return { valid: false, reason: `Edition slug change blocked: ${existingEntry.edition_slug} → ${newSlug}` };
        }
      }

      // WHY: If match changes color atoms, new atoms must be in palette
      if (existingEntry && m.new_key !== existingEntry.variant_key) {
        const atomStr = m.new_key.replace(/^(color|edition):/, '');
        for (const atom of atomStr.split('+').filter(Boolean)) {
          if (!paletteSet.has(atom.toLowerCase())) {
            return { valid: false, reason: `Unknown color atom "${atom}" in identity check mapping` };
          }
        }
      }
    }

    // WHY: new/reject actions must have null match field
    if ((m.action === 'new' || m.action === 'reject') && m.match != null) {
      return { valid: false, reason: `${m.action} action must have null match for "${m.new_key}"` };
    }

    // WHY: new color entries must have valid palette atoms.
    // Edition slugs are structural identity, not color atoms — Gate 1
    // already validates the edition's actual color atoms from the editions object.
    if (m.action === 'new' && !m.new_key.startsWith('edition:')) {
      const atomStr = m.new_key.replace(/^color:/, '');
      for (const atom of atomStr.split('+').filter(Boolean)) {
        if (!paletteSet.has(atom.toLowerCase())) {
          return { valid: false, reason: `Unknown color atom "${atom}" in new mapping "${m.new_key}"` };
        }
      }
    }
  }

  return { valid: true, reason: null };
}

/* ── Validate orphan remaps ────────────────────────────────────── */

/**
 * Validate orphan_remaps from LLM identity check response.
 * Separate from validateIdentityMappings — different contract.
 *
 * @param {object} opts
 * @param {Array<{orphan_key, action, remap_to, reason}>} opts.orphanRemaps
 * @param {Array} opts.registry — current variant_registry entries (post-apply)
 * @returns {{ valid: boolean, reason: string | null }}
 */
export function validateOrphanRemaps({ orphanRemaps = [], registry = [] }) {
  const registryKeys = new Set(registry.map(r => r.variant_key));
  const remapTargets = new Set();

  for (const or of orphanRemaps) {
    if (or.action === 'remap') {
      if (!or.remap_to) {
        return { valid: false, reason: `remap action must have non-null remap_to for "${or.orphan_key}"` };
      }
      if (!registryKeys.has(or.remap_to)) {
        return { valid: false, reason: `remap target "${or.remap_to}" not found in registry for "${or.orphan_key}"` };
      }
      if (remapTargets.has(or.remap_to)) {
        return { valid: false, reason: `Duplicate remap target: "${or.remap_to}" claimed by multiple orphans` };
      }
      remapTargets.add(or.remap_to);
    }

    if (or.action === 'dead') {
      if (or.remap_to != null) {
        return { valid: false, reason: `dead action must have null remap_to for "${or.orphan_key}"` };
      }
    }
  }

  return { valid: true, reason: null };
}

/* ── Apply identity mappings ───────────────────────────────────── */

/**
 * Apply LLM identity check mappings to an existing variant registry.
 *
 * WHY: On Run 2+, the LLM compares new discoveries against the existing
 * registry. Each mapping classifies a discovery as:
 * - match: same variant (update mutable fields if changed, preserve hash)
 * - new: genuinely new (create entry with new hash)
 * - reject: hallucinated/garbage (skip entirely)
 *
 * By the time this runs, both validation gates have passed — inputs are trusted.
 *
 * @param {object} opts
 * @param {Array} opts.existingRegistry — current variant_registry array
 * @param {Array<{new_key, match, action, reason}>} opts.mappings — LLM output
 * @param {string[]} opts.remove — variant_ids confirmed as wrong-product contamination
 * @param {string} opts.productId
 * @param {string[]} opts.colors — new discovery colors
 * @param {Record<string, string>} opts.colorNames — new discovery color names
 * @param {Record<string, object>} opts.editions — new discovery editions
 * @returns {{ registry: Array, removed: Array }} — kept registry + removed entries
 */
export function applyIdentityMappings({ existingRegistry, mappings, remove, productId, colors = [], colorNames = {}, editions = {} }) {
  const now = new Date().toISOString();
  const registry = existingRegistry.map((e) => ({ ...e }));
  const byId = new Map(registry.map((e) => [e.variant_id, e]));

  for (const mapping of mappings) {
    // ── reject: skip entirely ──
    if (mapping.action === 'reject') continue;

    // ── match: confirm identity, optionally update mutable fields ──
    if (mapping.action === 'match' && mapping.match) {
      const entry = byId.get(mapping.match);
      if (!entry) continue;

      // WHY: Type guard — a color and an edition are never the same variant.
      // If the LLM maps across types, force to new instead of corrupting the registry.
      const newKey = mapping.new_key;
      const newType = newKey.startsWith('edition:') ? 'edition' : 'color';
      if (entry.variant_type !== newType) {
        mapping.action = 'new';
        mapping.match = null;
        // Fall through to the new branch below
      } else {
        // WHY: Only update mutable fields if something actually changed.
        // Preserve variant_id + variant_type + created_at always.
        const keyChanged = newKey !== entry.variant_key;

        if (newKey.startsWith('edition:')) {
          const slug = entry.edition_slug; // WHY: slug never changes (Gate 2 enforces)
          const ed = editions[slug];
          const combo = (ed?.colors || [])[0] || '';
          let newLabel = ed?.display_name || slug;
          if (mapping.preferred_label) newLabel = mapping.preferred_label;
          const newAtoms = Array.isArray(mapping.preferred_color_atoms)
            ? mapping.preferred_color_atoms
            : combo ? combo.split('+').filter(Boolean) : [];
          const labelChanged = newLabel !== entry.variant_label;
          const atomsChanged = JSON.stringify(newAtoms) !== JSON.stringify(entry.color_atoms);

          if (keyChanged || labelChanged || atomsChanged) {
            if (keyChanged) entry.variant_key = newKey;
            if (labelChanged) {
              entry.variant_label = newLabel;
              entry.edition_display_name = newLabel;
            }
            if (atomsChanged) entry.color_atoms = newAtoms;
            entry.updated_at = now;
          }
        } else {
          const atom = newKey.replace('color:', '');
          const name = colorNames[atom];
          const hasName = name && name.toLowerCase() !== atom.toLowerCase();
          let newLabel = hasName ? name : atom;
          if (mapping.preferred_label) newLabel = mapping.preferred_label;
          const newAtoms = atom.split('+').filter(Boolean);
          const labelChanged = newLabel !== entry.variant_label;
          const atomsChanged = JSON.stringify(newAtoms) !== JSON.stringify(entry.color_atoms);

          if (keyChanged || labelChanged || atomsChanged) {
            if (keyChanged) entry.variant_key = newKey;
            if (labelChanged) entry.variant_label = newLabel;
            if (atomsChanged) entry.color_atoms = newAtoms;
            entry.updated_at = now;
          }
        }
        continue;
      }
    }

    // ── new: genuinely new variant ──
    if (mapping.action === 'new') {
      const newKey = mapping.new_key;
      const variantId = generateVariantId(productId, newKey);

      if (newKey.startsWith('edition:')) {
        const slug = newKey.replace('edition:', '');
        const ed = editions[slug];
        const combo = (ed?.colors || [])[0] || '';
        const colorAtoms = Array.isArray(mapping.preferred_color_atoms)
          ? mapping.preferred_color_atoms
          : combo ? combo.split('+').filter(Boolean) : [];
        registry.push({
          variant_id: variantId,
          variant_key: newKey,
          variant_type: 'edition',
          variant_label: ed?.display_name || slug,
          color_atoms: colorAtoms,
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

  // WHY: Removed variants are wrong-product contamination — hard-delete from registry.
  const removeSet = new Set(remove || []);
  const removed = registry.filter(e => removeSet.has(e.variant_id));
  const kept = registry.filter(e => !removeSet.has(e.variant_id));

  return { registry: kept, removed };
}
