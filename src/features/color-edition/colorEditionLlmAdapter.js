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
import { colorEditionFinderResponseSchema } from './colorEditionSchema.js';

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
 * Extracts known_colors/known_color_names/known_editions from the latest
 * run's selected state, plus accumulated urls/domains from all runs.
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

  const latest = previousRuns[previousRuns.length - 1];
  const sel = latest?.selected || {};
  const { urlsAlreadyChecked, domainsAlreadyChecked } = accumulateUrlsChecked(previousRuns);

  return {
    knownColors: Array.isArray(sel.colors) ? sel.colors : [],
    knownColorNames: (sel.color_names && typeof sel.color_names === 'object') ? sel.color_names : {},
    knownEditions: sel.editions ? Object.keys(sel.editions) : [],
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
export function buildColorEditionFinderPrompt({ colorNames = [], colors = [], product = {}, previousRuns = [] }) {
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

  return `You are a product researcher. Find every official color and every official edition for this exact product. Be exhaustive — check many sources and do not stop early.

Target product: ${brand} ${model}${variant ? ` (variant: ${variant})` : ''}

Known from prior runs (re-verify each, then find MORE):
- known_colors: ${knownColorsStr}
- known_color_names: ${knownColorNamesStr}
- known_editions: ${knownEditionsStr}
- urls_already_checked: ${urlsCheckedStr}

IDENTITY: Only return results for "${brand} ${model}". Exclude sibling models that have a different name (different suffixes like "Air", "Pro", etc. are different products). Only list a sibling in siblings_excluded if you actually encountered it during research — do not guess or invent siblings.

HOW TO SEARCH — do all of these:
1. Open the official ${brand} product page for "${model}". Look at the color picker / variant selector on the page. List every color swatch shown.
2. Open the ${brand} product FAMILY or CATEGORY page that lists all "${model}" variants — manufacturers often list special editions here that don't appear on the base product page.
3. Search Google: "${brand} ${model}" — check the top results for color and edition info.
4. Search Google: "${brand} ${model} all colors available" — retailers and review sites often list colors.
5. Search Google: "${brand} ${model} special edition" OR "limited edition" OR "collaboration"
6. Search Google: "${brand} ${model} Call of Duty" OR "Witcher" OR "Halo" OR "edition" — many peripherals have game tie-in editions with unique colors.
7. Check Amazon, Best Buy, Newegg for "${brand} ${model}" — retailers list ALL colorways and special editions as separate listings. Count them.
8. Search "${brand} ${model} announcement" OR "press release" OR "launch" for new colorways and editions.
9. Search "${brand} ${model} new color 2025" and "${brand} ${model} new color 2024" for recent additions.
10. If you found any editions, search each edition name individually to confirm its colors.

COMPLETENESS CHECK: Before returning, ask yourself: "Did I find every color shown on the official page? Did I check retailers for editions? Did I search for game/brand collaborations?" If not, search more.

COLOR FORMAT:
- Lowercase atoms only. Multi-color shells joined by "+" in dominant order (e.g. "black+red").
- Modifier-first: "light-blue" not "blue-light". Normalize "grey" to "gray".
- Translate marketing names to the nearest registered color atom by visual/hex similarity.
- colors[0] = the default/hero color on the official product page.
- Record the manufacturer's marketing name in color_names (e.g. "light-blue": "Glacier Blue").
- Registered color atoms: ${palette}

EDITION FORMAT:
- An edition is an officially named special/limited/collaboration/franchise version of this exact product sold by the manufacturer or authorized retailers.
- Slugs: kebab-case lowercase (e.g. "witcher-3-10th-anniversary-edition", "cod-bo6-edition").
- Each edition has a display_name (official name) and its own colors array.
- NOT an edition: plain color variants without a special name, bundles, refurbs, aftermarket skins.

RETURN JSON:
- "colors": array of ALL normalized colors (first = default)
- "default_color": must equal colors[0]
- "color_names": { color → marketing name } (omit when the atom IS the name)
- "editions": { slug → { "display_name": "...", "colors": [...] } } or {} if none
- "siblings_excluded": sibling model names you actually found and excluded (do NOT invent these)
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
