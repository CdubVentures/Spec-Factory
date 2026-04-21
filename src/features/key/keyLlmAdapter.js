/**
 * Key Finder — LLM adapter.
 *
 * Per-key, per-product extractor. Each LLM call targets ONE field_key on
 * ONE product; Phase 3 orchestrator iterates keys and dispatches tier-aware
 * model routing. The `reason` tag on every call is `key_finding_${tier}`
 * where tier ∈ {easy, medium, hard, very_hard} so billing rolls up per
 * difficulty.
 *
 * Exports:
 *   - KEY_FINDER_DEFAULT_TEMPLATE   — editable prompt surface (LLM Config)
 *   - buildKeyFinderPrompt          — renders the template with field_rule + discovery
 *   - buildKeyFinderSpec            — factory returning a per-call SPEC with tier reason
 *   - createKeyFinderCallLlm        — factory returning a bound LLM caller
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

export const KEY_FINDER_DEFAULT_TEMPLATE = `Find the value of \`{{FIELD_KEY}}\` for: {{BRAND}} {{MODEL}}{{VARIANT_SUFFIX}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}

FIELD GUIDANCE
{{FIELD_GUIDANCE}}

RETURN CONTRACT
{{FIELD_CONTRACT}}

{{EVIDENCE_CONTRACT}}

{{EVIDENCE_VERIFICATION}}

{{VALUE_CONFIDENCE_GUIDANCE}}

{{PREVIOUS_DISCOVERY}}Return JSON:
- "field_key": "{{FIELD_KEY}}"
- "value": matches the RETURN CONTRACT above, or "unk" if you cannot defend a value with evidence
- "confidence": 0-100 (your overall confidence in the returned value — see rubric above)
- "unknown_reason": "..." (required when value is "unk"; empty string otherwise)
- "evidence": [ { url, supporting_evidence, evidence_kind, tier, confidence } ]
- {{DISCOVERY_LOG_SHAPE}}
`;

/* ── Field-rule → prompt guidance helpers ──────────────────────────── */

function joinList(list, max = 8) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const taken = list.slice(0, max).map((s) => String(s).trim()).filter(Boolean);
  return taken.join(', ');
}

function buildFieldGuidanceBlock(fieldRule = {}) {
  const label = String(fieldRule?.ui?.label || fieldRule?.display_name || fieldRule?.field_key || '').trim();
  const tooltip = String(fieldRule?.ui?.tooltip || '').trim();
  const hints = fieldRule?.search_hints || {};
  const reasoningNote = String(fieldRule?.ai_assist?.reasoning_note || '').trim();

  const lines = [];
  if (label) lines.push(`- Label: ${label}`);
  if (tooltip) lines.push(`- Description: ${tooltip}`);
  const queryTerms = joinList(hints.query_terms);
  if (queryTerms) lines.push(`- Search terms to try: ${queryTerms}`);
  const domainHints = joinList(hints.domain_hints);
  if (domainHints) lines.push(`- Preferred source domains: ${domainHints}`);
  const preferredTiers = joinList(hints.preferred_tiers);
  if (preferredTiers) lines.push(`- Preferred evidence tiers: ${preferredTiers}`);
  if (reasoningNote) lines.push(`- Notes: ${reasoningNote}`);
  if (lines.length === 0) lines.push(`- Return the value of \`${fieldRule?.field_key || 'this field'}\` as defined by the contract below.`);
  return lines.join('\n');
}

function buildFieldContractBlock(fieldRule = {}) {
  const type = String(fieldRule?.contract?.type || fieldRule?.data_type || 'string').toLowerCase();
  const shape = String(fieldRule?.contract?.shape || fieldRule?.output_shape || 'scalar').toLowerCase();
  const unit = String(fieldRule?.contract?.unit || '').trim();
  const enumPolicy = String(fieldRule?.enum?.policy || '').trim();
  const allowedValues = Array.isArray(fieldRule?.enum?.values) ? fieldRule.enum.values : [];

  const lines = [];
  lines.push(`- Type: ${type}${shape === 'list' ? ' (list / array)' : ' (scalar)'}`);
  if (unit) lines.push(`- Unit: ${unit} — include the numeric value only; the unit is known from context.`);
  if (allowedValues.length > 0) {
    const list = allowedValues.slice(0, 24).join(' | ');
    lines.push(`- Allowed values${enumPolicy ? ` (policy: ${enumPolicy})` : ''}: ${list}`);
  } else if (enumPolicy) {
    lines.push(`- Enum policy: ${enumPolicy} (no fixed list — use an authoritative value).`);
  }
  if (shape === 'list') lines.push('- Return an array; each element must independently satisfy the type rule above.');
  return lines.join('\n');
}

/* ── Prompt builder ────────────────────────────────────────────────── */

/**
 * @param {object} opts
 * @param {object} opts.product               — { brand, model, base_model, variant? }
 * @param {string} opts.fieldKey              — the single key being extracted
 * @param {object} opts.fieldRule             — compiled field-rule entry (from engine.rules[fieldKey])
 * @param {string} [opts.category]
 * @param {number} [opts.variantCount]
 * @param {number} [opts.familyModelCount]
 * @param {string[]} [opts.siblingsExcluded]
 * @param {string} [opts.ambiguityLevel]      — 'easy' | 'medium' | 'hard'
 * @param {{urlsChecked: string[], queriesRun: string[]}} [opts.previousDiscovery]
 * @param {string} [opts.promptOverride]      — category-level override
 * @param {string} [opts.templateOverride]    — explicit template (preview pane)
 * @returns {string}
 */
export function buildKeyFinderPrompt({
  product = {},
  fieldKey = '',
  fieldRule = {},
  category = '',
  variantCount = 1,
  familyModelCount = 1,
  siblingsExcluded = [],
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
  promptOverride = '',
  templateOverride = '',
} = {}) {
  const brand = String(product?.brand || '').trim();
  const model = String(product?.model || product?.base_model || '').trim();
  const variant = String(product?.variant || '').trim();
  const variantSuffix = variant ? ` (variant: ${variant})` : '';

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels: siblingsExcluded,
    fieldDomainNoun: `${fieldKey || 'this field'} values`,
  });

  const discoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel: `this key (${fieldKey})`,
  });

  const minEvidenceRefs = Number(fieldRule?.evidence?.min_evidence_refs) > 0
    ? Number(fieldRule.evidence.min_evidence_refs)
    : 1;

  const template = templateOverride || promptOverride || KEY_FINDER_DEFAULT_TEMPLATE;

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_SUFFIX: variantSuffix,
    FIELD_KEY: fieldKey,
    CATEGORY: category,
    VARIANT_COUNT: String(variantCount),
    FIELD_GUIDANCE: buildFieldGuidanceBlock({ ...fieldRule, field_key: fieldKey }),
    FIELD_CONTRACT: buildFieldContractBlock(fieldRule),
    IDENTITY_INTRO: resolvePromptTemplate(resolveGlobalPrompt('identityIntro'), {
      BRAND: brand, MODEL: model, VARIANT_SUFFIX: variantSuffix,
    }),
    IDENTITY_WARNING: identityWarning,
    PREVIOUS_DISCOVERY: discoverySection,
    EVIDENCE_CONTRACT: buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind: true }),
    EVIDENCE_VERIFICATION: buildEvidenceVerificationPromptBlock(),
    VALUE_CONFIDENCE_GUIDANCE: buildValueConfidencePromptBlock(),
    DISCOVERY_LOG_SHAPE: resolveGlobalPrompt('discoveryLogShape'),
  });
}

/* ── SPEC factory — per-tier reason override ───────────────────────── */

function normalizeTier(tier) {
  const t = String(tier || '').trim().toLowerCase();
  return VALID_TIERS.has(t) ? t : 'medium';
}

/**
 * Build a per-call SPEC for the key finder. The `reason` tag carries the
 * difficulty tier so billing rolls up per-tier; everything else mirrors the
 * RDF / SKF shape.
 */
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

/** Backwards-compatible default SPEC (pre-tier-routing fallback). */
export const KEY_FINDER_SPEC = buildKeyFinderSpec({ tier: 'medium' });

/* ── Bound LLM caller factory ──────────────────────────────────────── */

/**
 * Create a bound LLM caller for the Key Finder with a tier-specific reason.
 *
 * @param {object} deps — createPhaseCallLlm dependency bag
 * @param {string} tier — 'easy' | 'medium' | 'hard' | 'very_hard'
 */
export function createKeyFinderCallLlm(deps, tier = 'medium') {
  const spec = buildKeyFinderSpec({ tier });
  return createPhaseCallLlm(deps, spec, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || domainArgs.product?.base_model || '',
      field_key: domainArgs.fieldKey || '',
      variant_count: domainArgs.variantCount || 1,
    }),
  }));
}
