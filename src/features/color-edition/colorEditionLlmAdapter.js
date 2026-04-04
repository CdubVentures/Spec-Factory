/**
 * Color & Edition Finder — LLM adapter.
 *
 * System prompt is built by reading the extraction guidance (reasoning_note)
 * from the colors and editions field rules — the same SSOT the extraction
 * pipeline uses. The finder concatenates both notes with a relationship
 * section and wraps them with product identity + response contract.
 *
 * Any edits to extraction guidance in the Field Rules Studio automatically
 * flow into the finder's prompt at call time.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { getEgPresetForKey } from '../studio/contracts/egPresets.js';
import { colorEditionFinderResponseSchema } from './colorEditionSchema.js';

/**
 * Build the system prompt for the Color & Edition Finder.
 *
 * Reads extraction guidance from the field rules SSOT (via getEgPresetForKey),
 * concatenates color + edition guidance, and wraps with product context.
 *
 * @param {object} opts
 * @param {string[]} opts.colorNames — registered color name strings
 * @param {object[]} opts.colors — full color objects [{ name, hex, css_var }]
 * @param {object} opts.product — { brand, model, variant, category, seed_urls }
 * @returns {string} Complete system prompt
 */
export function buildColorEditionFinderPrompt({ colorNames = [], colors = [], product = {} }) {
  const brand = product.brand || '';
  const model = product.model || '';
  const category = product.category || '';
  const variant = product.variant || '';
  const seedUrls = product.seed_urls || [];

  const productLine = [brand, product.base_model || model, variant].filter(Boolean).join(' ');
  const urlSection = seedUrls.length > 0
    ? `Known product URLs (start here): ${seedUrls.join(', ')}`
    : '';

  // Read extraction guidance from field rules SSOT
  const colorPreset = getEgPresetForKey('colors', { colorNames, colors });
  const editionPreset = getEgPresetForKey('editions', {});
  const colorGuidance = colorPreset?.ai_assist?.reasoning_note || '';
  const editionGuidance = editionPreset?.ai_assist?.reasoning_note || '';

  return [
    // ── Purpose ──
    'You are a product researcher for an equipment guide website.',
    `Your task: discover every color variant and special/limited edition available for a specific ${category} product, and return them as structured data.`,
    '',

    // ── Product Identity ──
    '## Product',
    `Name: ${productLine || 'Unknown'}`,
    `Category: ${category}`,
    urlSection,
    '',

    // ── Color Extraction Guidance (from field rules SSOT) ──
    '## Color Discovery & Formatting',
    colorGuidance,
    '',

    // ── Edition Extraction Guidance (from field rules SSOT) ──
    '## Edition Discovery & Formatting',
    editionGuidance,
    '',

    // ── Response Contract ──
    '## Response',
    'Return strict JSON with:',
    '- `colors`: array of ALL color variant strings for this product. First color = most common / default. Each string is a registered atom or "+"-joined combo (dominant-first). Include colors from all editions.',
    '- `editions`: array of kebab-case edition slugs (empty array if no special editions exist).',
    '- `new_colors`: array of `{name, hex}` for any color atoms NOT in the registered list. Absolute last resort only — exhaust registered matches first using hex similarity.',
  ].filter(Boolean).join('\n');
}

export const COLOR_EDITION_FINDER_SPEC = {
  phase: 'colorFinder',
  reason: 'color_edition_finding',
  role: 'triage',
  system: (domainArgs) => buildColorEditionFinderPrompt({
    colorNames: domainArgs.colorNames,
    colors: domainArgs.colors,
    product: domainArgs.product,
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
      model: domainArgs.product?.model || '',
      variant: domainArgs.product?.variant || '',
      category: domainArgs.product?.category || '',
      seed_urls: domainArgs.product?.seed_urls || [],
    }),
    timeoutMs: 120_000,
  }));
}
