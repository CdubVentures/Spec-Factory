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

{{PRODUCT_SCOPED_FACTS}}

{{VARIANT_INVENTORY}}

{{FIELD_IDENTITY_USAGE}}

{{PIF_PRIORITY_IMAGES}}

{{VALUE_NORMALIZATION}}

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

function buildProductScopedFactsBlock(productScopedFacts, { knownFieldsInjectionEnabled } = {}) {
  if (!knownFieldsInjectionEnabled) return '';
  const entries = Object.entries(productScopedFacts || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (entries.length === 0) return '';
  const lines = ['Resolved product-scoped facts:'];
  lines.push('Use these as context only. Do not extract these fields again.');
  for (const [k, v] of entries) {
    const value = Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
    lines.push(`- ${k}: ${value}`);
  }
  return lines.join('\n');
}

function csv(value) {
  return Array.isArray(value) ? value.map((v) => String(v)).join(', ') : String(value || '');
}

function buildVariantInventoryBlock(variantInventory, { product = {}, siblingsExcluded = [] } = {}) {
  const rows = Array.isArray(variantInventory) ? variantInventory : [];
  if (rows.length === 0) return '';
  const brand = String(product?.brand || '').trim();
  const model = String(product?.model || product?.base_model || '').trim();
  const baseModel = String(product?.base_model || '').trim();
  const variant = String(product?.variant || '').trim();
  const siblings = Array.isArray(siblingsExcluded) ? siblingsExcluded.filter(Boolean) : [];
  const lines = [
    'VARIANT_INVENTORY',
    'Locked identity context from dedicated variant finders. Do not extract, revise, or submit colors, editions, sku, or release_date through Key Finder. Use this only to avoid wrong-product or wrong-variant evidence.',
    'Blank sku/release_date cells mean not yet discovered, not evidence that no SKU/date exists.',
    '',
    `Product: ${[brand, model].filter(Boolean).join(' ')}`.trim(),
  ].filter(Boolean);
  if (baseModel) lines.push(`Base model: ${baseModel}`);
  if (variant) lines.push(`Current product variant: ${variant}`);
  if (siblings.length > 0) lines.push(`Sibling models to exclude: ${siblings.join(', ')}`);
  lines.push('');
  lines.push('| variant_id | variant_key | label | type | color_atoms | sku | release_date | image_status |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${String(row.variant_id || '')} | ${String(row.variant_key || '')} | ${String(row.label || '')} | ${String(row.type || '')} | ${csv(row.color_atoms)} | ${String(row.sku || '')} | ${String(row.release_date || '')} | ${String(row.image_status || '')} |`);
  }
  return lines.join('\n');
}

function buildFieldIdentityUsageBlock(fieldIdentityUsage, variantInventory) {
  const rows = Array.isArray(variantInventory) ? variantInventory : [];
  const text = String(fieldIdentityUsage || '').trim();
  if (rows.length === 0 || !text) return '';
  return `FIELD_IDENTITY_USAGE\n${text}`;
}

function isPifPriorityImagesEnabled(fieldRule = {}, context = {}) {
  const raw = fieldRule?.ai_assist?.pif_priority_images;
  if (raw === true || raw === false) return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.enabled === 'boolean') return raw.enabled;
  return context?.enabled === true;
}

function buildPifPriorityImagesBlock(context = {}, fieldRule = {}) {
  if (!isPifPriorityImagesEnabled(fieldRule, context)) return '';
  const priorityViews = Array.isArray(context.priorityViews)
    ? context.priorityViews.map((view) => String(view).trim()).filter(Boolean)
    : [];
  const images = Array.isArray(context.images) ? context.images : [];
  const variant = context.variant && typeof context.variant === 'object' ? context.variant : {};
  const lines = [
    'PIF_PRIORITY_IMAGES',
    'PIF default/base variant images are attached for visual support. Use them as supporting context only; they are not exhaustive product proof.',
    'Absence of a visible trait in these images is not proof the trait is absent. Prefer explicit source evidence when the field is not directly visible.',
  ];

  if (priorityViews.length > 0) {
    const label = images.length > 0 ? 'Priority views from PIF viewConfig' : 'Priority views requested from PIF viewConfig';
    lines.push(`${label}: ${priorityViews.join(', ')}`);
  }

  const variantLabel = String(variant.label || variant.variant_label || '').trim();
  const variantKey = String(variant.variant_key || '').trim();
  if (variantLabel || variantKey) {
    lines.push(`Variant: ${variantLabel || variantKey}${variantKey ? ` (${variantKey})` : ''}`);
  }

  if (images.length === 0) {
    const message = String(context.message || '').trim()
      || 'No PIF-evaluated priority images are available for the default/base variant.';
    lines.push(`PIF priority images are enabled for this key, but no PIF-evaluated priority images are available. ${message}`);
    lines.push('Do not infer visual traits from missing PIF images.');
    return lines.join('\n');
  }

  lines.push('Attached images:');
  for (const image of images) {
    if (!image || typeof image !== 'object') continue;
    const view = String(image.view || '').trim();
    const filename = String(image.filename || '').trim();
    const url = String(image.original_url || image.url || '').trim();
    const reasoning = String(image.eval_reasoning || image.reasoning || '').trim();
    const head = [view, filename].filter(Boolean).join(': ');
    lines.push(`- ${head || 'image'}${url ? ` (${url})` : ''}`);
    if (reasoning) lines.push(`  PIF note: ${reasoning}`);
  }
  return lines.join('\n');
}

function buildPifPriorityImageUserImages(context = {}) {
  const images = Array.isArray(context.images) ? context.images : [];
  return images
    .map((image, index) => {
      if (!image || typeof image !== 'object') return null;
      const fileUri = String(image.llm_file_uri || image.file_uri || '').trim();
      if (!fileUri) return null;
      const view = String(image.view || 'image').trim() || 'image';
      const filename = String(image.filename || `image-${index + 1}`).trim();
      return {
        id: `pif-priority:${view}:${filename}`,
        file_uri: fileUri,
        mime_type: String(image.mime_type || 'image/png').trim() || 'image/png',
        caption: String(image.caption || [view, filename].filter(Boolean).join(': ')).trim(),
      };
    })
    .filter(Boolean);
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
    sections.push([
      `Passenger key: ${p.fieldKey}`,
      contract,
      'Passenger evidence must come from the primary search session. Do not run passenger-specific searches to satisfy the evidence target; return passenger evidence only when it was found while researching the primary key.',
    ].join('\n'));
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

function buildKeyFinderEvidencePromptBlock({ minEvidenceRefs, hasPassengers }) {
  const base = buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind: true });
  if (!hasPassengers) return base;
  return `${base}\n\nKey-finder passenger evidence scope:\n- The minimum above is the primary key evidence target for this search session.\n- Passenger Evidence target lines are publisher context only; do not run passenger-specific searches to reach them.\n- Do not suppress a found passenger value solely because the primary session found fewer refs than the passenger target; return the passenger value with the evidence found in the primary session.`;
}

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
    element = `string (prefer one of [${enumValues.join(' | ')}]; unlisted only when direct evidence proves no listed value fits)`;
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
  lines.push(`      "evidence_refs": [{ "url", "tier", "confidence": 0-100, "supporting_evidence", "evidence_kind" }]`);
  lines.push(`    }${passengerKeys.length ? ',' : ''}`);
  for (let i = 0; i < passengerEntries.length; i++) {
    const p = passengerEntries[i];
    const last = i === passengerEntries.length - 1;
    lines.push(`    "${p.fieldKey}": {`);
    lines.push(`      "value": <${describeValueShape(p.fieldRule)}> | "unk",`);
    lines.push(`      "confidence": 0-100,`);
    lines.push(`      "unknown_reason": "..." (required when value is "unk"; empty string otherwise),`);
    lines.push(`      "evidence_refs": [{ "url", "tier", "confidence": 0-100, "supporting_evidence", "evidence_kind" }]`);
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
 * @param {Record<string, unknown>} [opts.productScopedFacts]
 * @param {Array<object>} [opts.variantInventory]
 * @param {string} [opts.fieldIdentityUsage]
 * @param {object} [opts.pifPriorityImageContext]
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
  productScopedFacts = knownFields,
  variantInventory = [],
  fieldIdentityUsage = '',
  pifPriorityImageContext = {},
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
    PRODUCT_SCOPED_FACTS: buildProductScopedFactsBlock(productScopedFacts, knobs),
    VARIANT_INVENTORY: buildVariantInventoryBlock(variantInventory, { product, siblingsExcluded }),
    FIELD_IDENTITY_USAGE: buildFieldIdentityUsageBlock(fieldIdentityUsage, variantInventory),
    PIF_PRIORITY_IMAGES: buildPifPriorityImagesBlock(pifPriorityImageContext, primaryRule),
    KNOWN_PRODUCT_FIELDS: buildProductScopedFactsBlock(productScopedFacts, knobs),
    VALUE_NORMALIZATION: resolveGlobalPrompt('keyFinderValueNormalization'),

    EVIDENCE_CONTRACT: buildKeyFinderEvidencePromptBlock({
      minEvidenceRefs,
      hasPassengers: passengerList.length > 0,
    }),
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
    const userText = JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || domainArgs.product?.base_model || '',
      primary_field_key: domainArgs.primary?.fieldKey || '',
      passenger_count: Array.isArray(domainArgs.passengers) ? domainArgs.passengers.length : 0,
      family_size: domainArgs.familySize || 1,
    });
    const userImages = buildPifPriorityImageUserImages(domainArgs.pifPriorityImageContext);
    const mapped = {
      user: userImages.length > 0 ? { text: userText, images: userImages } : userText,
    };
    if (modelOverride) mapped.modelOverride = modelOverride;
    if (capabilityOverride) mapped.capabilityOverride = capabilityOverride;
    return mapped;
  });
}
