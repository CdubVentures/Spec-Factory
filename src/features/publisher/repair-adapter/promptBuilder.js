import { repairResponseJsonSchema } from './repairResponseSchema.js';

// ── Common System Prompt (SSOT Section 14) ───────────────────────────────────

export const REPAIR_SYSTEM_PROMPT = `You are a field value validator for the Spec Factory product database.
Your job is to repair or reject LLM-extracted field values that failed
deterministic validation.

RULES:
- You MUST return valid JSON matching the response schema.
- Your repaired value will be re-validated through the same deterministic
  pipeline that rejected the original. It either passes or fails — binary.
- You MUST NOT hallucinate new values. If you're unsure, return null.
- For closed enums, you MUST map to an existing registered value or reject.
  You cannot invent new entries for a closed vocabulary.
- For open_prefer_known enums, you may confirm genuinely new values,
  but you must provide reasoning for why it's legitimate.
- Check for common LLM hallucination patterns:
  • Values that sound plausible but don't exist (e.g., "phantom-blue")
  • Overly specific values the source couldn't have known
  • Mix-ups between similar products
  • Round numbers that feel "guessed" rather than measured`;

// ── Hallucination Patterns (SSOT Section 15) ─────────────────────────────────

export const HALLUCINATION_PATTERNS = `HALLUCINATION RED FLAGS — reject if you see these:

1. COLOR NAMES that don't correspond to real colors:
   "phantom-blue", "sparkle-unicorn", "galaxy-fade", "rgb-wave"
   → These are made-up marketing terms, not color tokens.

2. SENSOR/SWITCH NAMES with impossible specs:
   "PAW9999" (doesn't exist), "PixArt 100K DPI" (no such sensor)
   → Cross-check against the component database provided.

3. MEASUREMENTS that violate physics:
   Mouse weighing 1g or 5000g. Mouse that's 500mm long.
   → Check sanity bounds provided.

4. DATES in the far future or distant past:
   A mouse released in 2030, or a sensor from 1990.
   → Products in this DB are typically 2015-present.

5. EDITION NAMES that are generic descriptions, not real editions:
   "regular", "standard", "basic", "default", "normal"
   → These are not real edition names. The base product has no edition.

6. FIELD VALUE = FIELD NAME or GENERIC LABEL:
   sensor: "sensor", switch: "switch", weight: "weight"
   → LLM echoed the prompt template.

7. VALUES COPIED FROM A DIFFERENT PRODUCT:
   If values seem internally inconsistent (wireless mouse with 0
   battery hours, wired mouse with 500h battery), suspect cross-
   contamination.

8. PERFECT ROUND NUMBERS for measured values:
   weight: exactly 100g, height: exactly 40mm
   → Real measurements have some precision. Reject if suspiciously round.`;

// ── Shared field contract block ──────────────────────────────────────────────
// WHY: Every prompt gets full field context so the LLM can make informed decisions.

export function buildFieldContractBlock(fieldKey, fieldRule, knownValues) {
  const c = fieldRule?.contract || {};
  const e = fieldRule?.enum || {};
  const p = fieldRule?.parse || {};

  const lines = [`FIELD CONTRACT for '${fieldKey}':`];

  const typeParts = [];
  if (c.type) typeParts.push(`Type: ${c.type}`);
  if (c.shape) typeParts.push(`Shape: ${c.shape}`);
  if (c.unit) typeParts.push(`Unit: ${c.unit}`);
  if (typeParts.length > 0) lines.push(`  ${typeParts.join(' | ')}`);

  if (c.range) {
    const min = c.range.min != null ? c.range.min : '—';
    const max = c.range.max != null ? c.range.max : '—';
    lines.push(`  Range: ${min} to ${max}${c.unit ? ' ' + c.unit : ''}`);
  }

  if (c.rounding) {
    lines.push(`  Rounding: ${c.rounding.decimals ?? '?'} decimals (${c.rounding.mode || 'nearest'})`);
  }

  const enumParts = [];
  const policy = knownValues?.policy || e.policy;
  if (policy) enumParts.push(`Enum: ${policy}`);
  if (knownValues?.values) enumParts.push(`${knownValues.values.length} known values`);
  if (e.match?.format_hint) enumParts.push(`Format: ${e.match.format_hint}`);
  if (enumParts.length > 0) lines.push(`  ${enumParts.join(' | ')}`);

  const acceptedFormats = p.accepted_formats;
  if (Array.isArray(acceptedFormats) && acceptedFormats.length > 0) {
    lines.push(`  Accepted formats: ${acceptedFormats.join(', ')}`);
  }

  return lines.join('\n');
}

// ── Per-field prompt dispatch (O(1) registry) ────────────────────────────────

const EXCLUDED_CODES = new Set(['wrong_shape']);

const PROMPT_REGISTRY = {
  enum_value_not_allowed:      buildEnumPrompt,
  unknown_enum_prefer_known:   buildEnumPrompt,
  wrong_type:                  buildTypePrompt,
  format_mismatch:        buildFormatPrompt,
  out_of_range:           buildRangePrompt,
  wrong_unit:             buildUnitPrompt,
  unit_required:          buildUnitPrompt,
};

/**
 * Build an LLM repair prompt from validation rejections.
 * @param {{ rejections: object[]|null, value: *, fieldKey: string, fieldRule: object, knownValues?: object }} opts
 * @returns {{ promptId: string, system: string, user: string, jsonSchema: object, params: object } | null}
 */
export function buildRepairPrompt({ rejections, value, fieldKey, fieldRule, knownValues }) {
  if (!rejections || rejections.length === 0 || !fieldKey) return null;

  const promptable = rejections.find(r => !EXCLUDED_CODES.has(r.reason_code) && PROMPT_REGISTRY[r.reason_code]);
  if (!promptable) return null;

  const ctx = { value, fieldKey, fieldRule, knownValues };
  const built = PROMPT_REGISTRY[promptable.reason_code](promptable, ctx);

  const system = REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS;

  return {
    promptId: built.promptId,
    system,
    user: built.userMessage,
    jsonSchema: repairResponseJsonSchema,
    params: built.params,
  };
}

/**
 * Build a P6 cross-field repair prompt.
 * @param {{ crossFieldFailures: object[]|null, fields: object, productName: string }} opts
 * @returns {{ promptId: string, system: string, user: string, jsonSchema: object, params: object } | null}
 */
export function buildCrossFieldRepairPrompt({ crossFieldFailures, fields, productName }) {
  if (!crossFieldFailures || crossFieldFailures.length === 0) return null;

  const constraintList = crossFieldFailures
    .map(f => `- [${f.rule_id}] ${f.constraint}: ${f.action}${f.detail ? ' — ' + JSON.stringify(f.detail) : ''}`)
    .join('\n');

  const relevantFieldValues = JSON.stringify(fields, null, 2);

  const userMessage = `Cross-field validation found inconsistencies in product '${productName}':

Failing constraints:
${constraintList}

Product context:
${relevantFieldValues}

For each constraint failure, create a decision entry where:
- "value" is the field key that needs fixing (e.g. "battery_hours")
- "resolved_to" is the corrected field value
- "decision" is "map_to_existing" to fix, "set_unk" if unknown, or "reject" if irreconcilable

Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<field_key>", "decision": "map_to_existing|set_unk|reject", "resolved_to": <new value or null>, "reasoning": "..." }]
}
Use status "rerun_recommended" if the data is too conflicting to resolve.`;

  const system = REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS;

  return {
    promptId: 'P6',
    system,
    user: userMessage,
    jsonSchema: repairResponseJsonSchema,
    params: { productName, constraintList, relevantFieldValues },
  };
}

// ── Per-prompt builders ──────────────────────────────────────────────────────

function buildEnumPrompt(rejection, ctx) {
  const { unknown, policy } = rejection.detail;
  const unknownValues = unknown || [];
  const values = ctx.knownValues?.values || [];
  const isClosed = policy === 'closed';
  const promptId = isClosed ? 'P1' : 'P2';

  const valueLabel = isClosed ? 'Registered' : 'Known';
  const policyLabel = isClosed ? 'closed' : 'open_prefer_known';
  const formatHint = ctx.fieldRule?.enum?.match?.format_hint || null;
  const contractBlock = buildFieldContractBlock(ctx.fieldKey, ctx.fieldRule, ctx.knownValues);

  const userMessage = `${contractBlock}

The field '${ctx.fieldKey}' has enum policy '${policyLabel}'.
The following values are not in the ${valueLabel.toLowerCase()} vocabulary:
  Unknown: ${JSON.stringify(unknownValues)}

${valueLabel} values (${values.length} total):
  ${JSON.stringify(values)}
${formatHint ? `\nExpected format pattern: ${formatHint}\nYour repaired value MUST match this pattern.` : ''}
For each unknown value:
1. MAP_TO_EXISTING: If it's a synonym/variant of a ${valueLabel.toLowerCase()} value,
   return the canonical ${valueLabel.toLowerCase()} name.
2. ${isClosed ? 'REJECT: If it looks hallucinated or nonsensical, reject it.\n   Reason: hallucination_detected | not_a_real_' + ctx.fieldKey : 'KEEP_NEW: If it\'s a genuinely valid new value for this field,\n   confirm it. Explain why it\'s legitimate.\n3. REJECT: If it looks hallucinated, reject it.'}
${isClosed ? '\nYou MUST NOT invent new values for a closed enum.' : ''}
Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<the unknown value>", "decision": "map_to_existing|keep_new|reject|set_unk", "resolved_to": "<canonical value or null>", "reasoning": "..." }]
}`;

  return {
    promptId,
    userMessage,
    params: {
      unknownValues,
      ...(isClosed ? { registeredValues: values } : { knownValues: values }),
      count: values.length,
    },
  };
}

function buildTypePrompt(rejection, ctx) {
  const expectedType = rejection.detail.expected || ctx.fieldRule?.contract?.type || 'string';
  const resolvedType = ctx.fieldRule?.contract?.type || 'string';
  const contractBlock = buildFieldContractBlock(ctx.fieldKey, ctx.fieldRule, ctx.knownValues);

  const userMessage = `${contractBlock}

The field '${ctx.fieldKey}' (type: ${expectedType}) received a value that
could not be deterministically converted:
  Value: ${JSON.stringify(ctx.value)}
  Expected type: ${expectedType}
  Template: ${resolvedType}

Your task:
1. If the value contains the answer in a different format, extract it.
   e.g. "twenty grams" → 20, "around 3.5 inches" → 88.9 (mm)
2. If the value is genuinely unknown, return null.
3. If the value is nonsensical or hallucinated, return null with
   reason: "hallucination_detected".

Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<the failing value>", "decision": "map_to_existing", "resolved_to": <extracted value or null>, "reasoning": "..." }]
}
Use decision "reject" with resolved_to null if hallucinated. Use decision "set_unk" with resolved_to null if genuinely unknown.`;

  return {
    promptId: 'P3',
    userMessage,
    params: { rawValue: ctx.value, expectedType, resolvedType },
  };
}

function buildFormatPrompt(rejection, ctx) {
  const resolvedType = ctx.fieldRule?.contract?.type || 'string';
  const formatHint = ctx.fieldRule?.enum?.match?.format_hint || null;
  const contractBlock = buildFieldContractBlock(ctx.fieldKey, ctx.fieldRule, ctx.knownValues);

  const userMessage = `${contractBlock}

The field '${ctx.fieldKey}' value failed format validation after normalization:
  Value: '${ctx.value}'
  Expected format: ${rejection.detail.reason || 'unknown'}
  Template: ${resolvedType}
${formatHint ? `  Format pattern: ${formatHint}` : ''}
The value does not match the required format after normalization.

Decide:
1. If you can extract a valid value, return it.${formatHint ? '\n   Your repaired value MUST match the pattern: ' + formatHint : ''}
2. If this looks like a hallucination, return null + reason.
3. If the value is unknown/missing, return null.

Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<the failing value>", "decision": "map_to_existing", "resolved_to": <fixed value or null>, "reasoning": "..." }]
}
Use decision "reject" with resolved_to null if hallucinated.`;

  return {
    promptId: 'P4',
    userMessage,
    params: { normalizedValue: ctx.value, resolvedType, formatReason: rejection.detail.reason },
  };
}

function buildRangePrompt(rejection, ctx) {
  const { min, max, actual } = rejection.detail;
  const unit = ctx.fieldRule?.contract?.unit || '';
  const rounding = ctx.fieldRule?.contract?.rounding;
  const contractBlock = buildFieldContractBlock(ctx.fieldKey, ctx.fieldRule, ctx.knownValues);

  const roundingNote = rounding
    ? `\nRounding: ${rounding.decimals ?? '?'} decimals (${rounding.mode || 'nearest'}). Your value must respect this precision.`
    : '';

  const userMessage = `${contractBlock}

The field '${ctx.fieldKey}' value is outside the expected range:
  Value: ${actual ?? ctx.value}${unit ? ' ' + unit : ''}
  Expected range: ${min != null ? min : '—'} to ${max != null ? max : '—'}${unit ? ' ' + unit : ''}${roundingNote}

This may indicate a hallucinated magnitude, a unit mismatch, or a data entry error.

Decide:
1. If you can determine the correct value, return it.
2. If the value is genuinely unknown, return null.
3. If this looks hallucinated, reject it.

Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<the failing value>", "decision": "map_to_existing", "resolved_to": <corrected numeric value or null>, "reasoning": "..." }]
}
Use decision "reject" with resolved_to null if hallucinated.`;

  return {
    promptId: 'P7',
    userMessage,
    params: { value: actual ?? ctx.value, unit, bounds: { min, max } },
  };
}

function buildUnitPrompt(rejection, ctx) {
  const { expected, detected } = rejection.detail;
  const contractBlock = buildFieldContractBlock(ctx.fieldKey, ctx.fieldRule, ctx.knownValues);

  const userMessage = `${contractBlock}

The field '${ctx.fieldKey}' requires unit '${expected}' but the value
was given in '${detected}':
  Value: ${JSON.stringify(ctx.value)}
  Expected unit: ${expected}
  Detected unit: ${detected}

Convert the value to ${expected} and return the numeric result.
If the value cannot be meaningfully converted, return null.
Return JSON matching this exact schema:
{
  "status": "repaired",
  "reason": null,
  "decisions": [{ "value": "<the original value>", "decision": "map_to_existing", "resolved_to": <converted number or null>, "reasoning": "..." }]
}`;

  return {
    promptId: 'unit_conversion',
    userMessage,
    params: { rawValue: ctx.value, expectedUnit: expected, detectedUnit: detected },
  };
}
