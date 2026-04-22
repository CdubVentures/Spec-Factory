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

/* ── Small helpers ─────────────────────────────────────────────────── */

function joinList(list, max = 16) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.slice(0, max).map((s) => String(s).trim()).filter(Boolean).join(', ');
}

function resolveDisplayName(fieldKey, fieldRule) {
  return String(fieldRule?.ui?.label || fieldRule?.display_name || fieldKey || '').trim();
}

/* ── Primary-key slot builders ─────────────────────────────────────── */

function buildPrimaryKeyHeaderBlock(fieldKey, fieldRule) {
  if (!fieldKey) return '';
  const label = resolveDisplayName(fieldKey, fieldRule);
  return label && label !== fieldKey
    ? `Field key: ${fieldKey} (${label})`
    : `Field key: ${fieldKey}`;
}

function buildFieldGuidanceBlock(fieldRule) {
  const note = String(fieldRule?.ai_assist?.reasoning_note || '').trim();
  if (!note) return '';
  return `Extraction guidance:\n${note}`;
}

function buildFieldContractBlock(fieldRule) {
  const type = String(fieldRule?.contract?.type || fieldRule?.data_type || 'string').toLowerCase();
  const shape = String(fieldRule?.contract?.shape || fieldRule?.output_shape || 'scalar').toLowerCase();
  const unit = String(fieldRule?.contract?.unit || '').trim();
  const rounding = fieldRule?.contract?.rounding;
  const listRules = fieldRule?.contract?.list_rules;
  const enumPolicy = String(fieldRule?.enum?.policy || '').trim();
  const enumValues = Array.isArray(fieldRule?.enum?.values) ? fieldRule.enum.values : [];
  const aliases = Array.isArray(fieldRule?.aliases) ? fieldRule.aliases.filter(Boolean) : [];
  const variancePolicy = String(fieldRule?.variance_policy || '').trim();

  const lines = ['Return contract:'];
  lines.push(`- Type: ${type}${shape === 'list' ? ' (list / array)' : ' (scalar)'}`);
  if (unit) lines.push(`- Unit: ${unit} (include the numeric value only; unit is known from context)`);
  if (rounding && Number.isFinite(rounding.decimals)) {
    lines.push(`- Rounding: ${rounding.decimals} decimal(s), mode=${rounding.mode || 'nearest'}`);
  }
  if (shape === 'list' && listRules) {
    const ruleParts = [];
    if (listRules.dedupe) ruleParts.push('dedupe');
    if (listRules.sort && listRules.sort !== 'none') ruleParts.push(`sort=${listRules.sort}`);
    if (ruleParts.length) lines.push(`- List rules: ${ruleParts.join(', ')}`);
  }
  if (enumValues.length > 0) {
    lines.push(`- Allowed values (policy: ${enumPolicy || 'open'}): ${enumValues.slice(0, 24).join(' | ')}`);
  } else if (enumPolicy) {
    lines.push(`- Enum policy: ${enumPolicy} (no fixed list \u2014 use an authoritative value)`);
  }
  if (variancePolicy) {
    lines.push(`- Variance policy: ${variancePolicy} (how to resolve disagreeing sources)`);
  }
  if (aliases.length > 0) {
    lines.push(`- Aliases (recognize these in source text): ${joinList(aliases)}`);
  }
  if (shape === 'list') {
    lines.push('- Return an array; each element must independently satisfy the type rule above.');
  }
  return lines.join('\n');
}

function buildSearchHintsBlock(fieldRule, { searchHintsInjectionEnabled } = {}) {
  if (!searchHintsInjectionEnabled) return '';
  const hints = fieldRule?.search_hints || {};
  const domainHints = joinList(hints.domain_hints);
  const queryTerms = joinList(hints.query_terms);
  if (!domainHints && !queryTerms) return '';
  const lines = ['Search hints:'];
  if (domainHints) lines.push(`- Preferred source domains: ${domainHints}`);
  if (queryTerms) lines.push(`- Search terms to try: ${queryTerms}`);
  return lines.join('\n');
}

function renderConstraintLine(c) {
  if (!c || typeof c !== 'object') return '';
  const target = String(c.target || '').trim();
  switch (c.op) {
    case 'lte': return target ? `must be \u2264 \`${target}\`` : '';
    case 'lt': return target ? `must be < \`${target}\`` : '';
    case 'gte': return target ? `must be \u2265 \`${target}\`` : '';
    case 'gt': return target ? `must be > \`${target}\`` : '';
    case 'eq': return target ? `must equal \`${target}\`` : '';
    case 'requires_when_value': {
      if (!target) return '';
      const val = String(c.value || '').trim();
      return `required when \`${target}\` = "${val}"`;
    }
    case 'requires_one_of': {
      if (!Array.isArray(c.targets) || c.targets.length === 0) return '';
      return `requires one of: ${c.targets.join(', ')}`;
    }
    default: return '';
  }
}

function buildCrossFieldConstraintsBlock(fieldRule) {
  const constraints = Array.isArray(fieldRule?.cross_field_constraints)
    ? fieldRule.cross_field_constraints
    : [];
  if (constraints.length === 0) return '';
  const lines = ['Cross-field constraints:'];
  for (const c of constraints) {
    const rendered = renderConstraintLine(c);
    if (rendered) lines.push(`- ${rendered}`);
  }
  if (lines.length === 1) return '';
  return lines.join('\n');
}

function buildComponentContextForKey(componentEntry, { componentInjectionEnabled } = {}) {
  if (!componentInjectionEnabled || !componentEntry) return '';
  const type = String(componentEntry.type || '').trim();
  const resolved = String(componentEntry.resolvedValue || '').trim();
  const relation = componentEntry.relation === 'parent' ? 'parent' : 'subfield_of';
  if (!type) return '';
  const lines = ['Component context:'];
  if (relation === 'parent') {
    lines.push(`- This field IS the component identity (type: ${type})`);
  } else {
    lines.push(`- This value belongs to the ${type} component on this product`);
  }
  lines.push(resolved
    ? `- Component: ${type} = ${resolved}`
    : `- Component: ${type} = (not yet identified)`);
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
  if (enumValues.length > 0) {
    element = `one of [${enumValues.join(' | ')}] (policy: ${enumPolicy || 'open'})`;
  } else {
    switch (type) {
      case 'number':
      case 'int':
      case 'integer':
      case 'float':
        element = unit ? `number (${unit})` : 'number';
        break;
      case 'boolean':
      case 'bool':
        element = 'boolean';
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
 * @param {Record<string, unknown>} [opts.knownFields]
 * @param {{primary: object|null, passengers: Array<object|null>}} [opts.componentContext]
 * @param {{componentInjectionEnabled: boolean, knownFieldsInjectionEnabled: boolean, searchHintsInjectionEnabled: boolean}} [opts.injectionKnobs]
 * @param {string} [opts.category]
 * @param {number} [opts.variantCount]
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
  knownFields = {},
  componentContext = { primary: null, passengers: [] },
  injectionKnobs = DEFAULT_KNOBS,
  category = '',
  variantCount = 1,
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
  const primaryRule = primary?.fieldRule || {};
  const passengerList = Array.isArray(passengers) ? passengers : [];

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
    VARIANT_COUNT: String(variantCount),

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
// tier bundle { name, model, ... } from resolvePhaseModelByTier. When a bundle
// carries a non-empty model, it flows through as per-call modelOverride so the
// Phase 3 orchestrator routes each field_key to its difficulty-matched model.
export function createKeyFinderCallLlm(deps, tierOrBundle = 'medium') {
  const isBundle = tierOrBundle && typeof tierOrBundle === 'object';
  const tierName = isBundle ? String(tierOrBundle.name || 'medium') : String(tierOrBundle);
  const modelOverride = isBundle ? String(tierOrBundle.model || '').trim() : '';
  const spec = buildKeyFinderSpec({ tier: tierName });
  return createPhaseCallLlm(deps, spec, (domainArgs) => {
    const mapped = {
      user: JSON.stringify({
        brand: domainArgs.product?.brand || '',
        model: domainArgs.product?.model || domainArgs.product?.base_model || '',
        primary_field_key: domainArgs.primary?.fieldKey || '',
        passenger_count: Array.isArray(domainArgs.passengers) ? domainArgs.passengers.length : 0,
        variant_count: domainArgs.variantCount || 1,
      }),
    };
    if (modelOverride) mapped.modelOverride = modelOverride;
    return mapped;
  });
}
