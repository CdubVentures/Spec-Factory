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

  const knownSection = (known.knownColors.length > 0 || known.knownEditions.length > 0)
    ? `\nPrevious findings to verify and expand beyond:\n- colors found so far: ${knownColorsStr}\n- color marketing names: ${knownColorNamesStr}\n- editions found so far: ${knownEditionsStr}\n- urls already checked: ${urlsCheckedStr}\nThese may be incomplete or wrong. Re-verify each, then find anything missing.\n`
    : '';

  return `Find every official color and every official edition for: ${brand} ${model}
${knownSection}
Research thoroughly. Check the manufacturer site, major retailers, press releases, and review sites. Look for standard colorways, limited editions, collaboration editions (game tie-ins, franchise partnerships), and regional exclusives. Do not stop after finding the first few — keep searching until you are confident you have found them all.

Only include results for the exact "${brand} ${model}" product. If you encounter sibling models with different names, exclude them and list them in siblings_excluded. Only list siblings you actually found — do not invent them.

Color output rules:
- Normalize to registered color atoms: ${palette}
- Lowercase, modifier-first ("light-blue" not "blue-light"), normalize "grey" to "gray"
- Multi-color shells: atoms joined by "+" in dominant order ("black+red")
- colors[0] must be the default color shown on the official product page
- Map marketing names in color_names (e.g. "light-blue": "Glacier Blue")

Edition output rules:
- An edition is a named special/limited/collaboration version sold by the manufacturer
- Slug format: kebab-case (e.g. "cod-bo6-edition", "witcher-3-10th-anniversary-edition")
- Each edition needs display_name (official name) and colors array
- Plain color variants, bundles, refurbs, and aftermarket skins are NOT editions

Return JSON with: colors, default_color, color_names, editions, siblings_excluded, discovery_log (with confirmed_from_known, added_new, rejected_from_known, urls_checked, queries_run arrays).`;
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
