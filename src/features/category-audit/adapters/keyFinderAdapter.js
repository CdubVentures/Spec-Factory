/**
 * key_finder consumer adapter: renders the per-key prompt preview using the
 * same pure field-rule → text renderers the live keyFinder uses.
 *
 * The audit report shows the EXACT text each slot would inject for a given
 * field. It does not simulate a full LLM call — no product, no sample data,
 * no bundling. Category-level slots (identity intro, evidence contract,
 * source tier strategy, etc.) are rendered once in Part 2 of the report;
 * this adapter only produces the per-key pieces.
 *
 * Single export:
 *   - renderKeyFinderPreview(fieldRule, fieldKey, { tierBundles, searchHintsEnabled, componentInjectionEnabled }) → PreviewBlock
 */

import {
  resolvePromptFieldRule,
  buildPrimaryKeyHeaderBlock,
  buildFieldGuidanceBlock,
  buildFieldContractBlock,
  buildSearchHintsBlock,
  buildCrossFieldConstraintsBlock,
} from '../../../core/llm/prompts/fieldRuleRenderers.js';

const VALID_TIERS = new Set(['easy', 'medium', 'hard', 'very_hard']);

function resolveTierBundle(tierBundles, difficulty) {
  const tiers = tierBundles || {};
  const fallback = tiers.fallback || {};
  const key = VALID_TIERS.has(difficulty) ? difficulty : 'medium';
  const bundle = tiers[key] || {};
  // Match resolvePhaseModelByTier behavior: if tier.model is empty, inherit the
  // entire fallback bundle rather than field-by-field mixing. This is how live
  // tier routing resolves incomplete tier configs today.
  const effective = bundle.model ? bundle : fallback;
  return {
    name: key,
    model: String(effective.model || ''),
    useReasoning: Boolean(effective.useReasoning),
    reasoningModel: String(effective.reasoningModel || ''),
    thinking: Boolean(effective.thinking),
    thinkingEffort: String(effective.thinkingEffort || ''),
    webSearch: Boolean(effective.webSearch),
  };
}

function buildComponentRelBlock(fieldRule, componentInjectionEnabled) {
  if (!componentInjectionEnabled) return '';
  const c = fieldRule?.component;
  if (c && c.type) {
    return `This key IS the ${c.type} component identity.`;
  }
  return '';
}

/**
 * @param {object} fieldRule        Raw compiled rule from field_rules.json
 * @param {string} fieldKey
 * @param {object} opts
 * @param {object} opts.tierBundles              keyFinderTierSettingsJson parsed
 * @param {boolean} [opts.searchHintsEnabled]    default true (live knob default)
 * @param {boolean} [opts.componentInjectionEnabled] default true
 * @param {object|null} [opts.knownValues]
 * @returns {{
 *   header: string,
 *   guidance: string,
 *   contract: string,
 *   searchHints: string,
 *   crossField: string,
 *   componentRel: string,
 *   tierBundle: { name, model, useReasoning, reasoningModel, thinking, thinkingEffort, webSearch }
 * }}
 */
export function renderKeyFinderPreview(fieldRule, fieldKey, {
  tierBundles = {},
  searchHintsEnabled = true,
  componentInjectionEnabled = true,
  knownValues = null,
} = {}) {
  const promptRule = resolvePromptFieldRule(fieldRule, { knownValues, fieldKey });
  const difficulty = String(promptRule?.priority?.difficulty || promptRule?.difficulty || 'medium').toLowerCase();
  return {
    header: buildPrimaryKeyHeaderBlock(fieldKey, promptRule),
    guidance: buildFieldGuidanceBlock(promptRule),
    contract: buildFieldContractBlock(promptRule),
    searchHints: buildSearchHintsBlock(promptRule, { searchHintsInjectionEnabled: searchHintsEnabled }),
    crossField: buildCrossFieldConstraintsBlock(promptRule),
    componentRel: buildComponentRelBlock(promptRule, componentInjectionEnabled),
    tierBundle: resolveTierBundle(tierBundles, difficulty),
  };
}
