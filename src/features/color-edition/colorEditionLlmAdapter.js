/**
 * Color & Edition Finder — LLM adapter (v2).
 *
 * Builds the v2 discovery prompt with identity lock, evidence rules,
 * anti-anchoring, and multi-run feedback. Web-capable models (Claude,
 * OpenAI) can browse to verify colors/editions against official sources.
 *
 * The registered color palette is injected dynamically from the colors
 * parameter (ultimately from appDb.listColors()). Known candidate inputs
 * are derived from previous runs for incremental discovery.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { colorEditionFinderResponseSchema, variantIdentityCheckResponseSchema } from './colorEditionSchema.js';

/**
 * Accumulate urls_checked from all previous runs' discovery_logs.
 * Pure function — unions across runs, deduplicates, extracts domains.
 *
 * @param {object[]} previousRuns
 * @returns {{ urlsAlreadyChecked: string[], domainsAlreadyChecked: string[] }}
 */
export function accumulateUrlsChecked(previousRuns) {
  const urlSet = new Set();
  for (const run of previousRuns) {
    const urls = run?.response?.discovery_log?.urls_checked;
    if (Array.isArray(urls)) {
      for (const u of urls) urlSet.add(u);
    }
  }

  const urlsAlreadyChecked = [...urlSet];
  const domainSet = new Set();
  for (const url of urlsAlreadyChecked) {
    try {
      domainSet.add(new URL(url).hostname);
    } catch { /* skip malformed URLs */ }
  }

  return {
    urlsAlreadyChecked,
    domainsAlreadyChecked: [...domainSet],
  };
}

/**
 * Build the known-inputs block for run N+1.
 * Accumulates colors, color_names, and editions across ALL non-rejected
 * runs (not just the latest). Same growth pattern as URLs — a color
 * found in run 1 stays visible even if run 2 missed it. The candidate
 * gate is the safety net, not the prompt.
 *
 * @param {object[]} previousRuns
 * @returns {object} { knownColors, knownColorNames, knownEditions, urlsAlreadyChecked, domainsAlreadyChecked }
 */
function buildKnownInputs(previousRuns) {
  if (!previousRuns || previousRuns.length === 0) {
    return {
      knownColors: [],
      knownColorNames: {},
      knownEditions: [],
      urlsAlreadyChecked: [],
      domainsAlreadyChecked: [],
    };
  }

  const { urlsAlreadyChecked, domainsAlreadyChecked } = accumulateUrlsChecked(previousRuns);

  // Union colors, color_names, editions across all non-rejected runs
  const colorSet = new Set();
  const colorNamesMap = {};
  const editionSet = new Set();

  for (const run of previousRuns) {
    if (run.status === 'rejected') continue;
    const sel = run.selected || {};

    if (Array.isArray(sel.colors)) {
      for (const c of sel.colors) colorSet.add(c);
    }
    if (sel.color_names && typeof sel.color_names === 'object') {
      for (const [atom, name] of Object.entries(sel.color_names)) {
        // Latest name wins per atom
        colorNamesMap[atom] = name;
      }
    }
    if (sel.editions && typeof sel.editions === 'object') {
      for (const slug of Object.keys(sel.editions)) editionSet.add(slug);
    }
  }

  return {
    knownColors: [...colorSet],
    knownColorNames: colorNamesMap,
    knownEditions: [...editionSet],
    urlsAlreadyChecked,
    domainsAlreadyChecked,
  };
}

/**
 * Build the registered color palette line for injection into the prompt.
 * Format: "name (#hex), name (#hex), ..."
 *
 * @param {object[]} colors — [{ name, hex }]
 * @returns {string}
 */
function buildPaletteLine(colors) {
  if (!colors || colors.length === 0) return '(no registered colors)';
  return colors.map(c => `${c.name} (${c.hex})`).join(', ');
}

/**
 * Build the system prompt for the Color & Edition Finder (v2).
 *
 * @param {object} opts
 * @param {string[]} opts.colorNames — registered color name strings
 * @param {object[]} opts.colors — full color objects [{ name, hex, css_var }]
 * @param {object} opts.product — { brand, base_model, model, variant }
 * @param {object[]} [opts.previousRuns] — compact history from prior runs
 * @returns {string} Complete system prompt
 */
export function buildColorEditionFinderPrompt({ colorNames = [], colors = [], product = {}, previousRuns = [], familyModelCount = 1, ambiguityLevel = 'easy' }) {
  const brand = product.brand || '';
  const baseModel = product.base_model || '';
  const model = product.model || '';
  const variant = product.variant || '';

  const queryModel = baseModel || model;
  const queryVariant = baseModel ? variant : '';
  const productLine = [brand, queryModel, queryVariant].filter(Boolean).join(' ');

  const known = buildKnownInputs(previousRuns);
  const palette = buildPaletteLine(colors);

  const knownColorsStr = known.knownColors.length > 0 ? JSON.stringify(known.knownColors) : '[]';
  const knownColorNamesStr = Object.keys(known.knownColorNames).length > 0 ? JSON.stringify(known.knownColorNames) : '{}';
  const knownEditionsStr = known.knownEditions.length > 0 ? JSON.stringify(known.knownEditions) : '[]';
  const urlsCheckedStr = known.urlsAlreadyChecked.length > 0 ? JSON.stringify(known.urlsAlreadyChecked) : '[]';
  const domainsCheckedStr = known.domainsAlreadyChecked.length > 0 ? JSON.stringify(known.domainsAlreadyChecked) : '[]';

  const knownSection = (known.knownColors.length > 0 || known.knownEditions.length > 0)
    ? `\nPrevious findings to verify and expand beyond:\n- colors found so far: ${knownColorsStr}\n- color marketing names: ${knownColorNamesStr}\n- editions found so far: ${knownEditionsStr}\n- urls already checked: ${urlsCheckedStr}\nThese may be incomplete or wrong. Re-verify each, then find anything missing.\n`
    : '';

  return `Find every official color and every official edition for: ${brand} ${model}
${knownSection}
Research thoroughly. Check the manufacturer site, major retailers, press releases, and review sites. Look for standard colorways, limited editions, collaboration editions (game tie-ins, franchise partnerships), and regional exclusives. Do not stop after finding the first few — keep searching until you are confident you have found them all.

Only include results for the exact "${brand} ${model}" product. If you encounter sibling models with different names, exclude them and list them in siblings_excluded. Only list siblings you actually found — do not invent them.
${familyModelCount > 1 ? `\nIDENTITY WARNING: This product has ${familyModelCount} models in its family (ambiguity: ${ambiguityLevel}). Similar products exist under "${brand}" with overlapping names. Verify you are researching the exact "${product.model}" — check model numbers, product page titles, and URL slugs. Do not mix colors/editions from sibling models.\n` : ''}

Color output rules:
- Normalize to registered color atoms: ${palette}
- Lowercase, modifier-first ("light-blue" not "blue-light"), normalize "grey" to "gray"
- Multi-color shells: atoms joined by "+" in dominant order ("black+red")
- Standard colorways should almost always be a SINGLE atom matching how retailers list the product. Reserve "+" for when the product is genuinely marketed as a named multi-color variant (e.g. "Frost White" = "white+silver"). Minor accents (trim, scroll wheels, logos, RGB lighting) do not warrant "+". Use color_names for the full marketing name instead (e.g. "black": "Translucent Black and Silver"). Editions typically ARE multi-color — a Cyberpunk edition with a black body, red accents, and yellow highlights = "black+red+yellow" is correct.
- colors[0] must be the default color shown on the official product page
- Map marketing names in color_names (e.g. "light-blue": "Glacier Blue"). REQUIRED when the atom is not an exact match for the manufacturer's color name. If the manufacturer calls it "Navy Sky Blue" and you normalize to "light-blue", you MUST record "light-blue": "Navy Sky Blue". Only omit the color_names entry when the atom IS the exact name (e.g. "black" = "Black").
- UNIQUE ENTRIES REQUIRED: Every colorway must have a unique entry in the colors array. Single-color products use a single atom ("black"). Multi-color products use atoms joined by "+" in dominant order ("dark-gray+black+orange"). No duplicates.
- COMPLETE LIST: The colors array must contain EVERY colorway — standard single colors, standard multi-color combos, AND edition combos. One entry per SKU/colorway.

Edition output rules:
- An edition is a named special/limited/collaboration version sold by the manufacturer
- Slug format: kebab-case (e.g. "cod-bo6-edition", "witcher-3-10th-anniversary-edition")
- Each edition needs display_name (official name) and a colors array with a SINGLE combo entry
- The combo entry joins all visible shell/body colors with "+" in dominant order (most dominant first). Example: a dark gray body with black accents and orange highlights = ["dark-gray+black+orange"]. A black and red edition = ["black+red"]. Use the same registered atoms.
- The edition's combo entry MUST also appear in the master colors array
- Plain color variants, bundles, refurbs, and aftermarket skins are NOT editions

Return JSON with these exact keys and shapes:
- "colors": ["atom", ...] (first = default)
- "default_color": "atom" (must equal colors[0])
- "color_names": { "atom": "Marketing Name", ... } (omit when atom IS the name)
- "editions": { "slug": { "display_name": "Official Name", "colors": ["atom+atom+atom"] }, ... } or {} if none found (colors is a single combo entry)
- "siblings_excluded": ["Model Name", ...]
- "discovery_log": { "confirmed_from_known": [], "added_new": [], "rejected_from_known": [], "urls_checked": [], "queries_run": [] }`;
}

export const COLOR_EDITION_FINDER_SPEC = {
  phase: 'colorFinder',
  reason: 'color_edition_finding',
  role: 'triage',
  system: (domainArgs) => buildColorEditionFinderPrompt({
    colorNames: domainArgs.colorNames,
    colors: domainArgs.colors,
    product: domainArgs.product,
    previousRuns: domainArgs.previousRuns || [],
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
  }),
  jsonSchema: zodToLlmSchema(colorEditionFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the Color & Edition Finder.
 * @param {{ callRoutedLlmFn, config, logger }} deps
 * @returns {(domainArgs) => Promise<object>}
 */
export function createColorEditionFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, COLOR_EDITION_FINDER_SPEC, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      base_model: domainArgs.product?.base_model || '',
      model: domainArgs.product?.model || '',
      variant: domainArgs.product?.variant || '',
    }),
  }));
}

/* ── Variant Identity Check (Run 2+) ─────────────────────────── */

/**
 * Build the system prompt for the variant identity check.
 *
 * WHY: On Run 2+, new discoveries may rename colors, refine atoms,
 * or add new variants. This prompt asks the LLM to compare each new
 * discovery against the existing registry and decide: same variant
 * (update metadata, keep hash) or genuinely new (create new hash).
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model }
 * @param {Array} opts.existingRegistry — current variant_registry entries
 * @param {string[]} opts.newColors — colors from discovery call
 * @param {Record<string, string>} opts.newColorNames — color_names from discovery
 * @param {Record<string, object>} opts.newEditions — editions from discovery
 * @param {string} [opts.promptOverride] — user override from settings
 * @returns {string} system prompt
 */
export function buildVariantIdentityCheckPrompt({ product = {}, existingRegistry = [], newColors = [], newColorNames = {}, newEditions = {}, promptOverride = '' }) {
  if (promptOverride.trim()) return promptOverride.trim();

  const brand = product.brand || '';
  const model = product.model || '';

  const registryLines = existingRegistry
    .filter((e) => !e.retired)
    .map((e) => `  ${e.variant_id} | ${e.variant_type} | ${e.variant_key} | label: "${e.variant_label}" | atoms: [${e.color_atoms.join(', ')}]${e.edition_slug ? ` | edition: ${e.edition_slug}` : ''}`)
    .join('\n');

  const newColorLines = newColors.map((c) => {
    const name = newColorNames[c];
    const hasName = name && name.toLowerCase() !== c.toLowerCase();
    const edition = Object.entries(newEditions).find(([, ed]) => (ed.colors || [])[0] === c);
    if (edition) {
      return `  edition:${edition[0]} — label: "${edition[1].display_name || edition[0]}", atoms: [${c.split('+').join(', ')}]`;
    }
    return `  color:${c}${hasName ? ` — label: "${name}"` : ''}, atoms: [${c.split('+').join(', ')}]`;
  }).join('\n');

  // WHY: Editions not in the colors array still need to be listed
  const listedCombos = new Set(newColors);
  const extraEditionLines = Object.entries(newEditions)
    .filter(([, ed]) => !(ed.colors || []).some((c) => listedCombos.has(c)))
    .map(([slug, ed]) => {
      const combo = (ed.colors || [])[0] || '';
      return `  edition:${slug} — label: "${ed.display_name || slug}", atoms: [${combo.split('+').join(', ')}]`;
    })
    .join('\n');

  const allNewLines = [newColorLines, extraEditionLines].filter(Boolean).join('\n');

  return `You are validating a Color & Edition Finder update for: ${brand} ${model}

EXISTING VARIANT REGISTRY (published, with stable IDs):
${registryLines || '  (none)'}

NEW CEF DISCOVERIES (from this run):
${allNewLines || '  (none)'}

For EACH new discovery, determine if it matches an existing variant or is genuinely new.

Matching rules:
- A color RENAME is the SAME variant (e.g. "Ocean Blue" → "Deep Ocean Blue" for the same product color). Map to existing ID.
- Color atoms gaining or losing a modifier for the same base color is the SAME variant (e.g. "blue" → "light-blue"). Map to existing ID.
- An edition gaining extra color detail in its combo is the SAME variant (e.g. "black+orange" → "black+orange+gold" for the same edition). Map to existing ID.
- A completely different color that never existed before is a NEW variant. Set match to null.
- A completely different edition slug with no relationship to existing editions is NEW.
- Existing variants NOT present in the new discoveries may be RETIRED — list their variant_ids in "retired" if they appear to be discontinued. Do NOT retire variants just because the LLM missed them in one run — only retire if you have evidence the product no longer comes in that color/edition.

Respond with JSON:
{
  "mappings": [
    { "new_key": "color:black", "match": "v_existing_id", "action": "update", "reason": "same color" },
    { "new_key": "color:crimson-red", "match": null, "action": "create", "reason": "genuinely new color" }
  ],
  "retired": ["v_id_of_discontinued_variant"]
}

Rules:
- Every new discovery MUST appear in "mappings" — do not skip any.
- "action" must be "update" (match found) or "create" (genuinely new).
- "match" must be an existing variant_id for updates, null for creates.
- "reason" should be 1 sentence explaining the decision.
- "retired" is an array of variant_ids — empty if nothing retired.
- When in doubt, prefer "update" (preserving existing identity) over "create" (orphaning old data).`;
}

export const VARIANT_IDENTITY_CHECK_SPEC = {
  phase: 'colorFinder',
  reason: 'variant_identity_check',
  role: 'triage',
  system: (domainArgs) => buildVariantIdentityCheckPrompt({
    product: domainArgs.product,
    existingRegistry: domainArgs.existingRegistry,
    newColors: domainArgs.newColors,
    newColorNames: domainArgs.newColorNames,
    newEditions: domainArgs.newEditions,
    promptOverride: domainArgs.promptOverride || '',
  }),
  jsonSchema: zodToLlmSchema(variantIdentityCheckResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the variant identity check.
 */
export function createVariantIdentityCheckCallLlm(deps) {
  return createPhaseCallLlm(deps, VARIANT_IDENTITY_CHECK_SPEC, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      existing_variants: (domainArgs.existingRegistry || []).length,
      new_colors: domainArgs.newColors?.length || 0,
      new_editions: Object.keys(domainArgs.newEditions || {}).length,
    }),
  }));
}
