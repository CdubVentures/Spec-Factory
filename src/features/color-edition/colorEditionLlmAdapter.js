/**
 * Color & Edition Finder — LLM adapter.
 *
 * Builds a focused prompt for color/edition discovery and validation.
 * On first run: pure discovery. On subsequent runs: validate + discover + select.
 *
 * Color and edition formatting rules come from the field studio SSOT
 * (egPresets.js via getEgPresetForKey). Web-browsing instructions are stripped
 * since this LLM call is structured output, not a web agent.
 *
 * The prompt sends: product identity, registered color palette with hex,
 * formatting rules, currently selected state (if any), and a response contract.
 * It does NOT send URLs, category, or web-browsing instructions.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { getEgPresetForKey } from '../studio/index.js';
import { colorEditionFinderResponseSchema } from './colorEditionSchema.js';

// WHY: The field studio reasoning notes include web-browsing instructions
// ("Check manufacturer page, Amazon, Best Buy, Newegg") that don't apply
// to this structured-output-only LLM call. Strip those lines.
const WEB_BROWSING_PATTERNS = [
  'check the manufacturer',
  'major retailers',
  'retailers,',
  'community forums',
];

/**
 * Strip web-browsing instruction lines from a field studio reasoning note.
 * @param {string} text
 * @returns {string}
 */
export function stripWebBrowsingLines(text) {
  if (!text) return '';
  return text.split('\n')
    .filter(line => {
      const lower = line.toLowerCase();
      return !WEB_BROWSING_PATTERNS.some(p => lower.includes(p));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Build the currently selected state section for validation runs.
 * @param {object[]} previousRuns — sorted by run_number
 * @returns {string} Section text or empty string
 */
function buildSelectedSection(previousRuns) {
  if (!previousRuns || previousRuns.length === 0) return '';

  const latest = previousRuns[previousRuns.length - 1];
  const sel = latest.selected || {};
  const colorList = sel.colors?.join(', ') || 'none';
  const defaultColor = sel.default_color || '?';
  const editions = sel.editions || {};
  const editionKeys = Object.keys(editions);

  const editionLines = editionKeys.length > 0
    ? editionKeys.map(slug => {
      const ec = editions[slug]?.colors || [];
      return `  ${slug}: ${ec.join(', ') || 'no colors'}`;
    })
    : ['  (none)'];

  return [
    'Currently selected (from previous run):',
    `  Colors: ${colorList}`,
    `  Default: ${defaultColor}`,
    '  Editions:',
    ...editionLines,
    '',
    'Your response replaces this selection entirely.',
    'Validate each entry — confirm it is real and currently available.',
    'Discover any new colors or editions not yet found.',
    'Omit any entry that is incorrect or discontinued — omitting IS the rejection.',
  ].join('\n');
}

/**
 * Build the system prompt for the Color & Edition Finder.
 *
 * Color and edition guidance come from the field studio SSOT (egPresets.js),
 * with web-browsing lines stripped. The response contract is specific to
 * the Color Edition Finder's structured output format.
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

  const hasPreviousRuns = previousRuns.length > 0;
  const selectedSection = buildSelectedSection(previousRuns);

  const directive = hasPreviousRuns
    ? 'Validate previous findings, discover anything new, and return the definitive complete selection.'
    : 'Discover all available colors and editions for this product.';

  // Field studio SSOT: color + edition reasoning notes (web lines stripped)
  const colorPreset = getEgPresetForKey('colors', { colorNames, colors });
  const editionPreset = getEgPresetForKey('editions', {});
  const colorGuidance = stripWebBrowsingLines(colorPreset?.ai_assist?.reasoning_note || '');
  const editionGuidance = stripWebBrowsingLines(editionPreset?.ai_assist?.reasoning_note || '');

  return [
    // ── Role + directive ──
    `Select the complete set of colors and editions for: ${productLine || 'Unknown product'}.`,
    directive,
    '',

    // ── Currently selected (validation runs only) ──
    selectedSection,
    selectedSection ? '' : null,

    // ── Color guidance (from field studio SSOT, web lines stripped) ──
    colorGuidance,
    '',

    // ── Edition guidance (from field studio SSOT, web lines stripped) ──
    editionGuidance,
    '',

    // ── Response contract ──
    'Return JSON:',
    '- "colors": all product colors (first = default). Registered atoms or "+"-joined combos.',
    '- "editions": object keyed by slug, each with "colors" array for that edition. Empty object if none.',
    '- "default_color": must equal colors[0].',
  ].filter(s => s !== null).filter(Boolean).join('\n');
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
