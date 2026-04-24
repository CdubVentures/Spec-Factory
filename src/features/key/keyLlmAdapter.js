/**
 * Key Finder — LLM adapter.
 *
 * Per-key, per-product extractor. One LLM call targets a primary field_key and
 * optionally N passenger field_keys (bundling). Each call is tier-tagged via
 * the SPEC (`reason: key_finding_${tier}`) so billing rolls up per difficulty.
 *
 * Per-category prompt editing: `templateOverride` is the per-category
 * `discoveryPromptTemplate` knob value; `promptOverride` is a back-compat
 * per-call override. Falls through to `KEY_FINDER_DEFAULT_TEMPLATE`.
 *
 * Exports:
 *   - KEY_FINDER_DEFAULT_TEMPLATE
 *   - buildKeyFinderPrompt
 *   - buildKeyFinderSpec
 *   - KEY_FINDER_SPEC
 *   - createKeyFinderCallLlm
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { resolvePromptTemplate } from '../../core/llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../../core/llm/prompts/globalPromptRegistry.js';
import { buildPreviousDiscoveryBlock } from '../../core/finder/discoveryLog.js';
import { buildEvidencePromptBlock } from '../../core/finder/evidencePromptFragment.js';
import { buildEvidenceVerificationPromptBlock } from '../../core/finder/evidenceVerificationPromptFragment.js';
import { buildValueConfidencePromptBlock } from '../../core/finder/valueConfidencePromptFragment.js';
import { buildIdentityWarning } from '../../core/llm/prompts/identityContext.js';
import {
  resolveDisplayName,
  resolvePromptFieldRule,
  buildPrimaryKeyHeaderBlock,
  buildFieldGuidanceBlock,
  buildFieldContractBlock,
  buildSearchHintsBlock,
  buildCrossFieldConstraintsBlock,
} from '../../core/llm/prompts/fieldRuleRenderers.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { keyFinderResponseSchema } from './keySchema.js';

const VALID_TIERS = new Set(['easy', 'medium', 'hard', 'very_hard']);

const DEFAULT_KNOBS = Object.freeze({
  componentInjectionEnabled: true,
  knownFieldsInjectionEnabled: true,
  searchHintsInjectionEnabled: true,
});

export const KEY_FINDER_DEFAULT_TEMPLATE = `Find value(s) for: {{BRAND}} {{MODEL}}{{VARIANT_SUFFIX}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}

GOAL: Extract the PRIMARY KEY value for this product using the FIELD CONTRACT below. When ADDITIONAL KEYS are listed, extract them opportunistically as passengers that share the primary's search session \u2014 do not spend extra searches on passengers; return "unk" for any passenger you don't find in the primary's evidence.

\u2500\u2500 PRIMARY KEY \u2500\u2500
{{PRIMARY_FIELD_KEY}}

{{PRIMARY_FIELD_GUIDANCE}}

{{PRIMARY_FIELD_CONTRACT}}

{{PRIMARY_SEARCH_HINTS}}

{{PRIMARY_CROSS_FIELD_CONSTRAINTS}}

{{PRIMARY_COMPONENT_KEYS}}

\u2500\u2500 ADDITIONAL KEYS \u2500\u2500
{{ADDITIONAL_FIELD_KEYS}}

{{ADDITIONAL_FIELD_GUIDANCE}}

{{ADDITIONAL_FIELD_CONTRACT}}

{{ADDITIONAL_CROSS_FIELD_CONSTRAINTS}}

{{ADDITIONAL_COMPONENT_KEYS}}

\u2500\u2500 CONTEXT \u2500\u2500
{{PRODUCT_COMPONENTS}}

{{KNOWN_PRODUCT_FIELDS}}

{{EVIDENCE_CONTRACT}}

{{EVIDENCE_VERIFICATION}}

{{SOURCE_TIER_STRATEGY}}

{{SCALAR_SOURCE_GUIDANCE_CLOSER}}

{{VALUE_CONFIDENCE_GUIDANCE}}

{{PREVIOUS_DISCOVERY}}

{{UNK_POLICY}}

{{RETURN_JSON_SHAPE}}
`;

/* ── Per-product / per-call slot builders ──────────────────────────── */

function buildComponentContextForKey(componentEntry, { componentInjectionEnabled } = {}) {
  // Relation pointer only. Resolved identity + sibling subfields live in
  // {{PRODUCT_COMPONENTS}}, which is always-on regardless of this knob.
  if (!componentInjectionEnabled || !componentEntry) return '';
  const type = String(componentEntry.type || '').trim();
  if (!type) return '';
  const relation = componentEntry.relation === 'parent' ? 'parent' : 'subfield_of';
  return relation === 'parent'
    ? `This key IS the ${type} component identity.`
    : `This key belongs to the ${type} component on this product.`;
}

function buildProductComponentsBlock(inventory) {
  const list = Array.isArray(inventory) ? inventory : [];
  if (list.length === 0) return '';
  const lines = ['Components on this product:'];
  for (const entry of list) {
    const type = String(entry.componentType || entry.parentFieldKey || '').trim();
    if (!type) continue;
    const resolved = String(entry.resolvedValue || '').trim();
    lines.push(resolved ? `- ${type}: ${resolved}` : `- ${type}: (unidentified)`);
    const subs = Array.isArray(entry.subfields) ? entry.subfields : [];
    for (const sf of subs) {
      if (!sf || !sf.field_key) continue;
      const value = Array.isArray(sf.value) ? `[${sf.value.join(', ')}]` : String(sf.value);
      lines.push(`    ${sf.field_key}: ${value}`);
    }
  }
  return lines.join('\n');
}

function buildKnownFieldsBlock(knownFields, { knownFieldsInjectionEnabled } = {}) {
  if (!knownFieldsInjectionEnabled) return '';
  const entries = Object.entries(knownFields || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (entries.length === 0) return '';
  const lines = ['Already-resolved fields on this product:'];
  for (const [k, v] of entries) {
    const value = Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
    lines.push(`- ${k}: ${value}`);
  }
  return lines.join('\n');
}

/* ── Additional-keys slot builders (split per category) ────────────── */

function buildAdditionalFieldKeysBlock(passengers) {
  if (!passengers || passengers.length === 0) return '';
  const lines = ['Additional keys to extract alongside the primary:'];
  for (const p of passengers) {
    const label = resolveDisplayName(p.fieldKey, p.fieldRule);
    lines.push(`- ${p.fieldKey}${label && label !== p.fieldKey ? ` (${label})` : ''}`);
  }
  return lines.join('\n');
}

function buildAdditionalFieldGuidanceBlock(passengers) {
  if (!passengers || passengers.length === 0) return '';
  const sections = [];
  for (const p of passengers) {
    const note = String(p.fieldRule?.ai_assist?.reasoning_note || '').trim();
    if (!note) continue;
    sections.push(`Passenger key: ${p.fieldKey}\n${note}`);
  }
  if (sections.length === 0) return '';
  return `Additional key guidance:\n${sections.join('\n\n')}`;
}

function buildAdditionalFieldContractBlock(passengers) {
  if (!passengers || passengers.length === 0) return '';
  const sections = [];
  for (const p of passengers) {
    const contract = buildFieldContractBlock(p.fieldRule);
    if (!contract) continue;
    sections.push(`Passenger key: ${p.fieldKey}\n${contract}`);
  }
  if (sections.length === 0) return '';
  return `Additional key contracts:\n${sections.join('\n\n')}`;
}

function buildAdditionalCrossFieldConstraintsBlock(passengers) {
  if (!passengers || passengers.length === 0) return '';
  const sections = [];
  for (const p of passengers) {
    const block = buildCrossFieldConstraintsBlock(p.fieldRule);
    if (!block) continue;
    sections.push(`Passenger key: ${p.fieldKey}\n${block}`);
  }
  if (sections.length === 0) return '';
  return `Additional cross-field constraints:\n${sections.join('\n\n')}`;
}

function buildAdditionalComponentKeysBlock(passengers, componentEntries, knobs = {}) {
  if (!knobs.componentInjectionEnabled) return '';
  if (!passengers || passengers.length === 0) return '';
  const entries = Array.isArray(componentEntries) ? componentEntries : [];
  const sections = [];
  for (let i = 0; i < passengers.length; i++) {
    const block = buildComponentContextForKey(entries[i], knobs);
    if (!block) continue;
    sections.push(`Passenger key: ${passengers[i].fieldKey}\n${block}`);
  }
  if (sections.length === 0) return '';
  return `Additional component context:\n${sections.join('\n\n')}`;
}

/* ── Return JSON shape ─────────────────────────────────────────────── */

// WHY: per-key value shape drives the LLM's native JSON emission. A number
// field gets a bare number, a list gets an array, enums get a literal allowed
// value, strings get strings. "unk" is always the string sentinel regardless.
function describeValueShape(fieldRule) {
  const type = String(fieldRule?.contract?.type || fieldRule?.data_type || 'string').toLowerCase();
  const shape = String(fieldRule?.contract?.shape || fieldRule?.output_shape || 'scalar').toLowerCase();
  const unit = String(fieldRule?.contract?.unit || '').trim();
  const enumPolicy = String(fieldRule?.enum?.policy || '').trim();
  const enumValues = Array.isArray(fieldRule?.enum?.values) ? fieldRule.enum.values.slice(0, 24) : [];
  let element;
  if ((type === 'boolean' || type === 'bool')) {
    element = 'boolean';
  } else if (enumValues.length > 0 && enumPolicy === 'open_prefer_known') {
    element = `string (prefer one of [${enumValues.join(' | ')}]; new evidenced values allowed)`;
  } else if (enumValues.length > 0 && enumPolicy !== 'open') {
    element = `one of [${enumValues.join(' | ')}] (policy: ${enumPolicy || 'open'})`;
  } else if (enumValues.length > 0) {
    element = `string (known examples: ${enumValues.join(' | ')})`;
  } else {
    switch (type) {
      case 'number':
      case 'int':
      case 'integer':
      case 'float':
        element = unit ? `number (${unit})` : 'number';
        break;
      case 'date':
        element = 'date string (match declared format)';
        break;
      default:
        element = 'string';
    }
  }
  return shape === 'list' ? `array of ${element}` : element;
}

function buildReturnJsonShape(primaryEntry, passengerEntries) {
  const primaryKey = primaryEntry.fieldKey;
  const passengerKeys = passengerEntries.map((p) => p.fieldKey);
  const lines = ['Return JSON (exact shape):'];
  lines.push(`{`);
  lines.push(`  "primary_field_key": "${primaryKey}",`);
  lines.push(`  "results": {`);
  lines.push(`    "${primaryKey}": {`);
  lines.push(`      "value": <${describeValueShape(primaryEntry.fieldRule)}> | "unk",`);
  lines.push(`      "confidence": 0-100,`);
  lines.push(`      "unknown_reason": "..." (required when value is "unk"; empty string otherwise),`);
  lines.push(`      "evidence_refs": [{ "url", "tier", "confidence": 0-100, "supporting_evidence", "evidence_kind" }],`);
  lines.push(`      "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }`);
  lines.push(`    }${passengerKeys.length ? ',' : ''}`);
  for (let i = 0; i < passengerEntries.length; i++) {
    const p = passengerEntries[i];
    const last = i === passengerEntries.length - 1;
    lines.push(`    "${p.fieldKey}": {`);
    lines.push(`      "value": <${describeValueShape(p.fieldRule)}> | "unk",  // same per-key shape as above`);
    lines.push(`      "confidence": 0-100, "unknown_reason": "...", "evidence_refs": [...], "discovery_log": {...}`);
    lines.push(`    }${last ? '' : ','}`);
  }
  lines.push(`  },`);
  lines.push(`  "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }`);
  lines.push(`}`);
  return lines.join('\n');
}

/* ── Prompt builder ────────────────────────────────────────────────── */

/**
 * @param {object} opts
 * @param {object} opts.product                         — { brand, model, base_model, variant? }
 * @param {{fieldKey: string, fieldRule: object}} opts.primary
 * @param {Array<{fieldKey: string, fieldRule: object}>} [opts.passengers]
 * @param {object|null} [opts.knownValues]
 * @param {Record<string, unknown>} [opts.knownFields]
 * @param {{primary: object|null, passengers: Array<object|null>}} [opts.componentContext] — per-key relation pointers (knob-gated)
 * @param {Array<{parentFieldKey: string, componentType: string, resolvedValue: string, subfields: Array<{field_key: string, value: unknown}>}>} [opts.productComponents] — always-on grouped inventory
 * @param {{componentInjectionEnabled: boolean, knownFieldsInjectionEnabled: boolean, searchHintsInjectionEnabled: boolean}} [opts.injectionKnobs]
 * @param {string} [opts.category]
 * @param {number} [opts.familySize]
 * @param {number} [opts.familyModelCount]
 * @param {string[]} [opts.siblingsExcluded]
 * @param {string} [opts.ambiguityLevel]
 * @param {{urlsChecked: string[], queriesRun: string[]}} [opts.previousDiscovery]
 * @param {string} [opts.templateOverride] — per-category discoveryPromptTemplate
 * @param {string} [opts.promptOverride]   — legacy per-call override
 * @returns {string}
 */
export function buildKeyFinderPrompt({
  product = {},
  primary = { fieldKey: '', fieldRule: {} },
  passengers = [],
  knownValues = null,
  knownFields = {},
  componentContext = { primary: null, passengers: [] },
  productComponents = [],
  injectionKnobs = DEFAULT_KNOBS,
  category = '',
  familySize = 1,
  familyModelCount = 1,
  siblingsExcluded = [],
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
  templateOverride = '',
  promptOverride = '',
} = {}) {
  const knobs = { ...DEFAULT_KNOBS, ...(injectionKnobs || {}) };
  const brand = String(product?.brand || '').trim();
  const model = String(product?.model || product?.base_model || '').trim();
  const variant = String(product?.variant || '').trim();
  const variantSuffix = variant ? ` (variant: ${variant})` : '';
  const primaryFieldKey = primary?.fieldKey || '';
  const primaryRule = resolvePromptFieldRule(primary?.fieldRule || {}, { knownValues, fieldKey: primaryFieldKey });
  const passengerList = Array.isArray(passengers)
    ? passengers.map((p) => ({
      ...p,
      fieldRule: resolvePromptFieldRule(p?.fieldRule || {}, { knownValues, fieldKey: p?.fieldKey || '' }),
    }))
    : [];

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels: siblingsExcluded,
    fieldDomainNoun: `${primaryFieldKey || 'this field'} values`,
  });

  const minEvidenceRefs = Number(primaryRule?.evidence?.min_evidence_refs) > 0
    ? Number(primaryRule.evidence.min_evidence_refs)
    : 1;

  const template = templateOverride || promptOverride || KEY_FINDER_DEFAULT_TEMPLATE;

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_SUFFIX: variantSuffix,
    CATEGORY: category,
    FAMILY_SIZE: String(familySize),

    IDENTITY_INTRO: resolvePromptTemplate(resolveGlobalPrompt('identityIntro'), {
      BRAND: brand, MODEL: model, VARIANT_SUFFIX: variantSuffix,
    }),
    IDENTITY_WARNING: identityWarning,

    PRIMARY_FIELD_KEY: buildPrimaryKeyHeaderBlock(primaryFieldKey, primaryRule),
    PRIMARY_FIELD_GUIDANCE: buildFieldGuidanceBlock(primaryRule),
    PRIMARY_FIELD_CONTRACT: buildFieldContractBlock(primaryRule),
    PRIMARY_SEARCH_HINTS: buildSearchHintsBlock(primaryRule, knobs),
    PRIMARY_CROSS_FIELD_CONSTRAINTS: buildCrossFieldConstraintsBlock(primaryRule),
    PRIMARY_COMPONENT_KEYS: buildComponentContextForKey(componentContext?.primary, knobs),

    ADDITIONAL_FIELD_KEYS: buildAdditionalFieldKeysBlock(passengerList),
    ADDITIONAL_FIELD_GUIDANCE: buildAdditionalFieldGuidanceBlock(passengerList),
    ADDITIONAL_FIELD_CONTRACT: buildAdditionalFieldContractBlock(passengerList),
    ADDITIONAL_CROSS_FIELD_CONSTRAINTS: buildAdditionalCrossFieldConstraintsBlock(passengerList),
    ADDITIONAL_COMPONENT_KEYS: buildAdditionalComponentKeysBlock(passengerList, componentContext?.passengers, knobs),

    PRODUCT_COMPONENTS: buildProductComponentsBlock(productComponents),
    KNOWN_PRODUCT_FIELDS: buildKnownFieldsBlock(knownFields, knobs),

    EVIDENCE_CONTRACT: buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind: true }),
    EVIDENCE_VERIFICATION: buildEvidenceVerificationPromptBlock(),
    SOURCE_TIER_STRATEGY: resolveGlobalPrompt('scalarSourceTierStrategy'),
    SCALAR_SOURCE_GUIDANCE_CLOSER: resolveGlobalPrompt('scalarSourceGuidanceCloser'),
    VALUE_CONFIDENCE_GUIDANCE: buildValueConfidencePromptBlock(),
    UNK_POLICY: resolveGlobalPrompt('unkPolicy'),

    PREVIOUS_DISCOVERY: buildPreviousDiscoveryBlock({
      urlsChecked: previousDiscovery.urlsChecked,
      queriesRun: previousDiscovery.queriesRun,
      scopeLabel: `this key (${primaryFieldKey})`,
    }),

    RETURN_JSON_SHAPE: buildReturnJsonShape(
      { fieldKey: primaryFieldKey, fieldRule: primaryRule },
      passengerList,
    ),
  });
}

/* ── SPEC factory ──────────────────────────────────────────────────── */

function normalizeTier(tier) {
  const t = String(tier || '').trim().toLowerCase();
  return VALID_TIERS.has(t) ? t : 'medium';
}

export function buildKeyFinderSpec({ tier = 'medium' } = {}) {
  const safeTier = normalizeTier(tier);
  return Object.freeze({
    phase: 'keyFinder',
    reason: `key_finding_${safeTier}`,
    role: 'triage',
    system: (domainArgs) => buildKeyFinderPrompt(domainArgs),
    jsonSchema: zodToLlmSchema(keyFinderResponseSchema),
  });
}

export const KEY_FINDER_SPEC = buildKeyFinderSpec({ tier: 'medium' });

/* ── Bound LLM caller factory ──────────────────────────────────────── */

// WHY: Accepts either a tier name string (legacy — billing reason only) or a
// tier bundle { name, model, useReasoning, reasoningModel, thinking,
// thinkingEffort, webSearch } from resolvePhaseModelByTier. The bundle is the
// full authority for keyFinder's per-call model + capabilities — phase-level
// _resolvedKeyFinder* reads for those 5 capability fields are superseded once
// a bundle is supplied. Phase-level LIMITS (tokens, timeout, reasoning budget,
// disableLimits, jsonStrict) are intentionally shared across all tiers and
// stay phase-level.
export function createKeyFinderCallLlm(deps, tierOrBundle = 'medium') {
  const isBundle = tierOrBundle && typeof tierOrBundle === 'object';
  const tierName = isBundle ? String(tierOrBundle.name || 'medium') : String(tierOrBundle);
  const spec = buildKeyFinderSpec({ tier: tierName });

  // WHY: When useReasoning=true AND reasoningModel is non-empty, route to
  // reasoningModel (mirrors resolvePhaseModel's base/reasoning selection). When
  // useReasoning=true but reasoningModel is empty, fall back to tier.model so
  // we never emit an empty override (which would wipe the resolver's
  // last-resort path and land on llmModelPlan).
  let modelOverride = '';
  let capabilityOverride = null;
  if (isBundle) {
    const useReasoning = Boolean(tierOrBundle.useReasoning);
    const reasoningModel = String(tierOrBundle.reasoningModel || '').trim();
    const baseModel = String(tierOrBundle.model || '').trim();
    modelOverride = useReasoning && reasoningModel ? reasoningModel : baseModel;
    capabilityOverride = {
      useReasoning,
      thinking: Boolean(tierOrBundle.thinking),
      thinkingEffort: String(tierOrBundle.thinkingEffort || ''),
      webSearch: Boolean(tierOrBundle.webSearch),
    };
  }

  return createPhaseCallLlm(deps, spec, (domainArgs) => {
    const mapped = {
      user: JSON.stringify({
        brand: domainArgs.product?.brand || '',
        model: domainArgs.product?.model || domainArgs.product?.base_model || '',
        primary_field_key: domainArgs.primary?.fieldKey || '',
        passenger_count: Array.isArray(domainArgs.passengers) ? domainArgs.passengers.length : 0,
        family_size: domainArgs.familySize || 1,
      }),
    };
    if (modelOverride) mapped.modelOverride = modelOverride;
    if (capabilityOverride) mapped.capabilityOverride = capabilityOverride;
    return mapped;
  });
}
