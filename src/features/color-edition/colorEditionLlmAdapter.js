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
import { resolvePromptTemplate } from '../../core/llm/resolvePromptTemplate.js';
import { buildEvidencePromptBlock } from '../../core/finder/evidencePromptFragment.js';
import { buildEvidenceVerificationPromptBlock } from '../../core/finder/evidenceVerificationPromptFragment.js';
import { buildValueConfidencePromptBlock } from '../../core/finder/valueConfidencePromptFragment.js';
import { buildPreviousDiscoveryBlock } from '../../core/finder/discoveryLog.js';
import { buildIdentityWarning } from '../../core/llm/prompts/identityContext.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { colorEditionFinderResponseSchema, variantIdentityCheckResponseSchema } from './colorEditionSchema.js';

const FIELD_DOMAIN_NOUN = 'colors or editions';

/**
 * Build the known-inputs block for run N+1.
 * Accumulates colors, color_names, and editions across ALL non-rejected
 * runs (not just the latest). A color found in run 1 stays visible even
 * if run 2 missed it. The candidate gate is the safety net, not the prompt.
 *
 * @param {object[]} previousRuns
 * @returns {object} { knownColors, knownColorNames, knownEditions }
 */
function buildKnownInputs(previousRuns) {
  if (!previousRuns || previousRuns.length === 0) {
    return {
      knownColors: [],
      knownColorNames: {},
      knownEditions: [],
    };
  }

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
// WHY: Default template with {{VARIABLE}} placeholders for the CEF discovery prompt.
// Extracted so users can customize instructions while dynamic data injection is preserved.
export const CEF_DISCOVERY_DEFAULT_TEMPLATE = `Find every official color and every official edition for: {{BRAND}} {{MODEL}}
{{KNOWN_FINDINGS}}
Research thoroughly. Check the manufacturer site, major retailers, press releases, and review sites. Look for standard colorways, limited editions, collaboration editions (game tie-ins, franchise partnerships), and regional exclusives. Do not stop after finding the first few — keep searching until you are confident you have found them all.

Only include results for the exact "{{BRAND}} {{MODEL}}" product. If you encounter sibling models with different names, exclude them and list them in siblings_excluded. Only list siblings you actually found — do not invent them.
{{IDENTITY_WARNING}}

Color output rules:
- Normalize to registered color atoms: {{PALETTE}}
- Lowercase, modifier-first ("light-blue" not "blue-light"), normalize "grey" to "gray"
- Multi-color shells: atoms joined by "+" in dominant order ("black+red")
- Standard colorways should almost always be a SINGLE atom matching how retailers list the product. Reserve "+" for when the product is genuinely marketed as a named multi-color variant (e.g. "Frost White" = "white+silver"). Minor accents (trim, scroll wheels, logos, RGB lighting) do not warrant "+". Use color_names for the full marketing name instead (e.g. "black": "Translucent Black and Silver"). Editions typically ARE multi-color — a Cyberpunk edition with a black body, red accents, and yellow highlights = "black+red+yellow" is correct.
- colors[0].name must be the default color shown on the official product page
- Map marketing names in color_names (e.g. "light-blue": "Glacier Blue"). REQUIRED when the atom is not an exact match for the manufacturer's color name. If the manufacturer calls it "Navy Sky Blue" and you normalize to "light-blue", you MUST record "light-blue": "Navy Sky Blue". Only omit the color_names entry when the atom IS the exact name (e.g. "black" = "Black").
- UNIQUE ENTRIES REQUIRED: Every colorway must have a unique entry (by name) in the colors array. Single-color products use a single atom ("black"). Multi-color products use atoms joined by "+" in dominant order ("dark-gray+black+orange"). No duplicate names.
- COMPLETE LIST: The colors array must contain EVERY colorway — standard single colors, standard multi-color combos, AND edition combos. One entry per SKU/colorway.

Edition output rules:
- An edition is a named special/limited/collaboration version sold by the manufacturer
- Slug format: kebab-case (e.g. "cod-bo6-edition", "witcher-3-10th-anniversary-edition")
- display_name is the EDITION NAME ONLY — the collaboration/franchise/limited descriptor. Do NOT include the brand, base model, or model-line marketing copy. Strip any "{{BRAND}} {{MODEL}} –" style prefix (or equivalent suffix) so only the edition descriptor remains. Good: "Call of Duty: Black Ops 6 Edition", "Cyberpunk 2077: Arasaka Edition", "DOOM: The Dark Ages Edition", "Witcher 3: Wild Hunt 10th Anniversary Edition". Bad: "M75 WIRELESS Lightweight RGB Gaming Mouse – CALL OF DUTY® BLACK OPS 6 EDITION", "DOOM™: The Dark Ages: M75 WIRELESS".
- Each edition also needs a colors array with a SINGLE combo entry
- The combo entry joins all visible shell/body colors with "+" in dominant order (most dominant first). Example: a dark gray body with black accents and orange highlights = ["dark-gray+black+orange"]. A black and red edition = ["black+red"]. Use the same registered atoms.
- The edition's combo entry MUST also appear in the master colors array (as a colors[] entry with that combo as its name)
- Plain color variants, bundles, refurbs, and aftermarket skins are NOT editions

{{EVIDENCE_REQUIREMENTS}}

Per-item evidence rules:
- Attach evidence_refs to EACH colors[] entry and to EACH editions[<slug>] entry.
- Each item's evidence_refs must be the sources that specifically support THAT color or THAT edition.
- The SAME source URL may appear on multiple items if it genuinely covers all of them (e.g. an official product page listing every colorway). Do NOT fabricate distinct sources per item when one source truly covers them all.
- If you cannot find any source for an item, omit the item entirely rather than invent evidence.

{{VALUE_CONFIDENCE_GUIDANCE}}
Rate the per-item "confidence" on each colors[] entry and each editions[<slug>] entry against its own cited evidence — a color you cross-confirmed on two tier1 pages may be 95 while a single-source color may be 70 in the same response.

Atom collision self-audit (MANDATORY before finalizing):
- Compare atom sets across every pair (color/color, color/edition, edition/edition). Atom set = name split by "+" for colors, colors[0] split by "+" for editions.
- When a color and edition share atoms, it is EXTREMELY RARE for them to be genuinely separate SKUs. The usual causes of apparent collision:
  (a) DUAL NAMING — one source calls the SKU by its color marketing name (e.g. "Thunderbolt Yellow"), another calls the SAME SKU by its edition name (e.g. "Launch Edition"). Same product under two labels. Do NOT emit both.
  (b) MISSING ATOM — the color has a distinguishing accent/trim/finish you overlooked. Re-check sources and update the atom string.
  (c) TRUE COEXISTENCE — a standalone SKU and an edition SKU sold separately. Rarest case; requires visual proof below.
- To accept coexistence you must VISUALLY PROVE they are not the same variant: find product images on SEPARATE product pages showing visually distinct shells (different colors, different branding, different packaging). Identical images on different URLs do NOT prove distinctness.
- Priority when resolving unresolvable collisions (edition > color with color_names entry > bare color): if you cannot visually prove distinctness, drop the lower-priority variant.
- Color/color collisions with different color_names entries (e.g. two brands' "yellow" named differently) ARE legit — keep both.
- Document every accepted coexisting pair in collisions[] with resolution "distinct_color_names" or "distinct_evidence" + resolution_notes showing what proved the distinction. Return [] if no pairs share atoms after resolution.

{{PREVIOUS_DISCOVERY}}Return JSON with these exact keys and shapes:
- "colors": [{ "name": "atom", "confidence": 0-100, "evidence_refs": [{ "url": "...", "tier": "tier1|tier2|tier3|tier4|tier5|other", "confidence": 0-100 }, ...] }, ...] (first entry = default)
- "default_color": "atom" (must equal colors[0].name)
- "color_names": { "atom": "Marketing Name", ... } (omit when atom IS the name)
- "editions": { "slug": { "display_name": "Edition Name Only (e.g. 'Cyberpunk 2077: Arasaka Edition' — NOT '<brand> <model> – Cyberpunk 2077: Arasaka Edition')", "confidence": 0-100, "colors": ["atom+atom+atom"], "evidence_refs": [{ "url": "...", "tier": "...", "confidence": 0-100 }, ...] }, ... } or {} if none found (colors is a single combo entry)
- "siblings_excluded": ["Model Name", ...]
- "collisions": [{ "variants": ["color:<atom>" | "edition:<slug>", ...], "shared_atoms": ["atom", ...], "resolution": "distinct_color_names" | "distinct_evidence", "resolution_notes": "..." }, ...] or [] if no coexisting atom-sharing pairs
- "discovery_log": { "confirmed_from_known": [], "added_new": [], "rejected_from_known": [], "urls_checked": [], "queries_run": [] }`;

export function buildColorEditionFinderPrompt({ colorNames = [], colors = [], product = {}, previousRuns = [], previousDiscovery = { urlsChecked: [], queriesRun: [] }, familyModelCount = 1, ambiguityLevel = 'easy', siblingModels = [], templateOverride = '', minEvidenceRefs = 1 }) {
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

  const knownSection = (known.knownColors.length > 0 || known.knownEditions.length > 0)
    ? `\nPrevious findings to verify and expand beyond:\n- colors found so far: ${knownColorsStr}\n- color marketing names: ${knownColorNamesStr}\n- editions found so far: ${knownEditionsStr}\nThese may be incomplete or wrong. Re-verify each, then find anything missing.\n`
    : '';

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model: product.model,
    siblingModels,
    fieldDomainNoun: FIELD_DOMAIN_NOUN,
  });

  const template = templateOverride || CEF_DISCOVERY_DEFAULT_TEMPLATE;

  const discoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel: 'this product',
  });

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    KNOWN_FINDINGS: knownSection,
    IDENTITY_WARNING: identityWarning ? `\n${identityWarning}\n` : '',
    PALETTE: palette,
    EVIDENCE_REQUIREMENTS: `${buildEvidencePromptBlock({ minEvidenceRefs })}\n\n${buildEvidenceVerificationPromptBlock()}`,
    VALUE_CONFIDENCE_GUIDANCE: buildValueConfidencePromptBlock(),
    PREVIOUS_DISCOVERY: discoverySection,
  });
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
    previousDiscovery: domainArgs.previousDiscovery || { urlsChecked: [], queriesRun: [] },
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
    siblingModels: domainArgs.siblingModels || [],
    minEvidenceRefs: domainArgs.minEvidenceRefs,
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
export function buildVariantIdentityCheckPrompt({ product = {}, existingRegistry = [], newColors = [], newColorNames = {}, newEditions = {}, promptOverride = '', familyModelCount = 1, ambiguityLevel = 'easy', siblingModels = [], runCount = 0, orphanedPifKeys = [], minEvidenceRefs = 1 }) {
  if (promptOverride.trim()) return promptOverride.trim();

  const brand = product.brand || '';
  const model = product.model || '';

  const registryLines = existingRegistry
    .map((e) => `  ${e.variant_id} | ${e.variant_type} | ${e.variant_key} | label: "${e.variant_label}" | atoms: [${e.color_atoms.join(', ')}]${e.edition_slug ? ` | edition: ${e.edition_slug}` : ''}`)
    .join('\n');

  // WHY: Dual-rule mirrors buildVariantRegistry / buildVariantList. Only
  // MULTI-ATOM combos in colors[] dedupe against editions — for "black+red+yellow"
  // the colors entry IS the edition. Single-atom entries like "black" are always
  // plain colorways: distinct from any edition that happens to be black-bodied.
  // Pre-fix regression (M75 Wireless): single-atom edition combo absorbed the
  // standalone color line and the edition was filtered out of extraEditionLines,
  // so LLM 2 saw neither the standalone color nor the second edition.
  const promotedEditionSlugs = new Set();
  const newColorLines = newColors.map((c) => {
    const name = newColorNames[c];
    const hasName = name && name.toLowerCase() !== c.toLowerCase();
    const isMultiAtom = c.includes('+');
    const edition = isMultiAtom
      ? Object.entries(newEditions).find(([, ed]) => (ed.colors || [])[0] === c)
      : null;
    if (edition) {
      promotedEditionSlugs.add(edition[0]);
      return `  edition:${edition[0]} — label: "${edition[1].display_name || edition[0]}", atoms: [${c.split('+').join(', ')}]`;
    }
    return `  color:${c}${hasName ? ` — label: "${name}"` : ''}, atoms: [${c.split('+').join(', ')}]`;
  }).join('\n');

  // List every edition not already promoted via a multi-atom combo above.
  // Single-atom editions always land here even when their atom matches a
  // standalone color, so LLM 2 sees both as distinct discoveries.
  const extraEditionLines = Object.entries(newEditions)
    .filter(([slug]) => !promotedEditionSlugs.has(slug))
    .map(([slug, ed]) => {
      const combo = (ed.colors || [])[0] || '';
      return `  edition:${slug} — label: "${ed.display_name || slug}", atoms: [${combo.split('+').join(', ')}]`;
    })
    .join('\n');

  const allNewLines = [newColorLines, extraEditionLines].filter(Boolean).join('\n');

  const ambiguityText = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels,
    fieldDomainNoun: FIELD_DOMAIN_NOUN,
  });
  const ambiguityBlock = ambiguityText ? `\n${ambiguityText}\n` : '';

  const trustAnchor = runCount > 0
    ? `The existing registry was confirmed by ${runCount} prior analysis pass${runCount > 1 ? 'es' : ''}. Treat existing variants as "confirmed unless proven wrong." The burden of proof is on NEW discoveries.`
    : 'This is the first identity check for this product. All discoveries are unconfirmed.';

  return `You are the VARIANT JUDGE for: ${brand} ${model}

Your job is to validate, compare, and judge variant data quality — not just match IDs.
${ambiguityBlock}
EXISTING VARIANT REGISTRY (published, with stable IDs):
${registryLines || '  (none)'}

NEW CEF DISCOVERIES (from this run):
${allNewLines || '  (none)'}

TRUST ANCHOR: ${trustAnchor}

─── VALIDATION PROTOCOL ───

For any "new" or uncertain discovery, verify against official sources before accepting.
Search: "${brand} ${model} [color/edition name]" on the manufacturer site and 1-2 major retailers.
You know the exact brand and model — keep queries scoped and targeted.
If 2-3 sources don't confirm a discovery, reject it as hallucinated.
Set "verified": true on any mapping you confirmed via web search.

─── JUDGE INSTRUCTIONS ───

You are not just matching — you are judging quality. For each discovery:
1. IDENTIFY: Does it match an existing variant, or is it genuinely new?
2. VALIDATE: Can you confirm it exists for THIS exact model via web search?
3. COMPARE: If matching an existing variant, compare the labels. More detail and accuracy always wins.
   - If the new name is more official/accurate, set "preferred_label" to the better name.
   - If the existing label is already correct or better, omit preferred_label.
4. DECIDE: match (same variant), new (genuinely new and verified), or reject (hallucinated/unverifiable).

─── MATCHING RULES ───

- Decide "match" vs "new" based on what you verify, not on how similar the atoms look. Two variants that share atoms can still be separate colorways sold by the manufacturer; two variants with drifted atom parses can still be the same colorway. Verify before deciding.
- A completely different color that never existed before is genuinely NEW — but ONLY if you can verify it. Set action to "new", match to null.
- A completely different edition slug with no relationship to existing editions is "new" — verify it exists.
- Existing variants NOT present in the new discoveries may need REMOVAL. List their variant_ids in "remove" ONLY if you verified via web that the variant was NEVER a real product for this exact model — hallucination, wrong-product contamination, or data that never existed. Discontinued or limited-run products that WERE real must NOT be removed. If in doubt, do NOT remove.

─── HALLUCINATION CHECK ───

If a discovery cannot be found on the official product page or any major retailer, REJECT it.
Common hallucination patterns:
- Colors that belong to a sibling model, not this one
- Standalone MULTI-ATOM color combos that duplicate an edition's atoms (e.g. "olive+black+red" when a DOOM edition exists with those atoms). Single-atom standalones coexisting with an edition of the same atom(s) are EXTREMELY RARE. The most common cause is DUAL NAMING: one article calls the SKU by its color marketing name (e.g. "Thunderbolt Yellow"), another calls the same SKU by its edition name (e.g. "Launch Edition") — same product under two labels. To accept both as distinct you must VISUALLY PROVE they are not the same variant: find product images on SEPARATE product pages showing visually distinct shells. When you cannot visually prove distinctness, apply priority (edition > color with color_names entry > bare color) and reject the lower-priority variant.
- Colors or editions that existed for a previous generation but not this model
Use your web access to verify — scoped queries, not endless searching.

─── EVIDENCE REQUIREMENTS ───

${buildEvidencePromptBlock({ minEvidenceRefs })}

${buildEvidenceVerificationPromptBlock()}

Attach evidence_refs to each mapping (for match, new, and reject actions alike — cite what you checked).

Relevance check (MANDATORY):
- Each evidence_ref URL must specifically support THAT mapping's variant. Read the URL slug, page title, and visible content before attaching it.
- Reject and drop any URL whose slug or title explicitly names a DIFFERENT variant than the one it's attached to. Examples of wrong attribution to catch and strip:
  - An edition-specific URL (slug contains "call-of-duty", "cyberpunk-2077", "doom-the-dark-ages", "-edition", etc.) cited under a plain colorway entry like color:black or color:white.
  - A color-specific URL (e.g. ".../frost-white-ch-xxx") cited under a different color's entry.
  - A sibling-model URL (e.g. a non-wireless SKU page cited under a wireless variant).
- If every URL on a mapping fails the relevance check, strip them all and return an empty evidence_refs for that mapping — the publisher will gate it as low-evidence rather than accept misattributed proof.

─── CONFIDENCE ───

${buildValueConfidencePromptBlock()}
Rate the per-mapping "confidence" against the evidence you cited for that specific mapping. A match confirmed by two tier1 sources may be 95; a reject based on absence-of-evidence may be 80 (you are confident it's bogus). Keep each mapping's confidence scoped to that mapping.

─── RESPONSE FORMAT ───

Respond with JSON:
{
  "mappings": [
    { "new_key": "color:black", "match": "v_existing_id", "action": "match", "reason": "confirmed on ${brand.toLowerCase() || 'manufacturer'}.com — same color", "verified": true, "confidence": 95, "evidence_refs": [{"url": "https://${brand.toLowerCase() || 'manufacturer'}.com/product", "tier": "tier1", "confidence": 95}] },
    { "new_key": "color:deep-ocean-blue", "match": "v_rename_target", "action": "match", "reason": "renamed from ocean-blue, official name per manufacturer", "verified": true, "preferred_label": "Deep Ocean Blue", "confidence": 92, "evidence_refs": [{"url": "https://${brand.toLowerCase() || 'manufacturer'}.com/product", "tier": "tier1", "confidence": 95}] },
    { "new_key": "color:crimson-red", "match": null, "action": "new", "reason": "confirmed on ${brand.toLowerCase() || 'manufacturer'}.com and bestbuy.com", "verified": true, "confidence": 85, "evidence_refs": [{"url": "https://${brand.toLowerCase() || 'manufacturer'}.com/crimson", "tier": "tier1", "confidence": 90}, {"url": "https://bestbuy.com/listing", "tier": "tier3", "confidence": 70}] },
    { "new_key": "color:rainbow-sparkle", "match": null, "action": "reject", "reason": "not found on official site or any retailer — likely hallucinated", "verified": true, "confidence": 80, "evidence_refs": [] }
  ],
  "remove": [],
  "orphan_remaps": []
}
${orphanedPifKeys.length > 0 ? `
─── ORPHANED PIF IMAGE KEYS ───

These variant_keys exist on product images but do NOT match any entry in the existing registry.
For each orphaned key, decide:
- "remap": This is the same variant as an existing registry entry (drifted slug). Set remap_to to the correct registry variant_key.
- "dead": This key was NEVER a real variant — it was hallucinated, corrupted, or test data. ONLY use "dead" when you are certain the variant never existed as a real product. Discontinued/retired/limited-run products are STILL REAL and must NOT be marked dead.
- If an orphaned key represents a real product variant (current OR discontinued) but has no matching registry entry, OMIT it from orphan_remaps entirely. It will remain flagged for manual review.

Orphaned keys:
${orphanedPifKeys.map(k => '  ' + k).join('\n')}

Add your decisions to "orphan_remaps":
  { "orphan_key": "edition:doom-old-slug", "action": "remap", "remap_to": "edition:doom-correct-slug", "reason": "slug drift — same edition" }
  { "orphan_key": "color:sparkle-rainbow", "action": "dead", "remap_to": null, "reason": "hallucinated color — no evidence this product was ever sold in this color" }
` : ''}

─── STRUCTURAL RULES (MUST FOLLOW) ───

- Every new discovery MUST appear in "mappings" — do not skip any.
- "action" must be "match", "new", or "reject".
- "match" must be an existing variant_id for "match" actions, null for "new" and "reject".
- "reason" should be 1 sentence explaining the decision and what you checked.
- "verified": true if you confirmed via web search, false if matched purely by structural identity.
- "preferred_label": optional string — only for "match" actions where you found a better/more official name.
- "remove" is an array of variant_ids — empty if nothing removed. Only for wrong-product contamination, never for discontinued real products.
- Each existing variant_id may appear at most ONCE across all mappings.
- Edition slugs must NOT change. If matching an edition, use the EXISTING slug in new_key (e.g. if the registry has "edition:cod-bo6", your new_key must be "edition:cod-bo6", NOT "edition:cod-bo6-edition").
- NEVER map a color to an edition or an edition to a color. They are fundamentally different variant types. A standalone color combo (e.g. "olive+black+red") is NOT the same as an edition (e.g. "DOOM: The Dark Ages Edition") even if their atoms overlap. If a color has similar atoms to an edition, they are STILL separate variants — use "reject" for the suspicious color or "new" if it genuinely exists.`;
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
    familyModelCount: domainArgs.familyModelCount,
    ambiguityLevel: domainArgs.ambiguityLevel,
    siblingModels: domainArgs.siblingModels || [],
    runCount: domainArgs.runCount,
    orphanedPifKeys: domainArgs.orphanedPifKeys || [],
    minEvidenceRefs: domainArgs.minEvidenceRefs,
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
