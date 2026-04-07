import { repairResponseJsonSchema } from './repairResponseSchema.js';

// ── Common System Prompt (SSOT Section 14) ───────────────────────────────────

export const REPAIR_SYSTEM_PROMPT = `You are a field value validator for the Spec Factory product database.
Your job is to repair or reject LLM-extracted field values that failed
deterministic validation.

RULES:
- You MUST return valid JSON matching the response schema.
- Confidence 0.0-1.0: only values ≥ 0.8 will be auto-applied.
  Values 0.5-0.8 are flagged for human review.
  Values < 0.5 are treated as rejection.
- You MUST NOT hallucinate new values. If you're unsure, return "unk".
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
   → Real measurements have some precision. Flag low confidence.`;

// ── Per-field prompt dispatch (O(1) registry) ────────────────────────────────

const EXCLUDED_CODES = new Set(['wrong_shape']);

const PROMPT_REGISTRY = {
  enum_value_not_allowed: buildEnumPrompt,
  wrong_type:             buildTypePrompt,
  format_mismatch:        buildFormatPrompt,
  not_in_component_db:    buildComponentPrompt,
  out_of_range:           buildRangePrompt,
  wrong_unit:             buildUnitPrompt,
};

/**
 * Build an LLM repair prompt from validation rejections.
 * @param {{ rejections: object[]|null, value: *, fieldKey: string, fieldRule: object, knownValues?: object, componentDb?: object }} opts
 * @returns {{ promptId: string, system: string, user: string, jsonSchema: object, params: object } | null}
 */
export function buildRepairPrompt({ rejections, value, fieldKey, fieldRule, knownValues, componentDb }) {
  if (!rejections || rejections.length === 0 || !fieldKey) return null;

  const promptable = rejections.find(r => !EXCLUDED_CODES.has(r.reason_code) && PROMPT_REGISTRY[r.reason_code]);
  if (!promptable) return null;

  const ctx = { value, fieldKey, fieldRule, knownValues, componentDb };
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

For each constraint failure:
1. If you can determine the correct value from context, provide it.
2. If the data is genuinely conflicting, flag which field is more
   likely wrong and why.
3. If you cannot resolve, recommend manual review.

Return: { repairs: [{ field, old_value, new_value, confidence, reasoning }] }`;

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
  const listLabel = isClosed ? 'registeredValuesList' : 'knownValuesList';

  const userMessage = `The field '${ctx.fieldKey}' has enum policy '${policyLabel}'.
The following values are not in the ${valueLabel.toLowerCase()} vocabulary:
  Unknown: ${JSON.stringify(unknownValues)}

${valueLabel} values (${values.length} total):
  ${JSON.stringify(values)}

For each unknown value:
1. MAP_TO_EXISTING: If it's a synonym/variant of a ${valueLabel.toLowerCase()} value,
   return the canonical ${valueLabel.toLowerCase()} name + confidence.
2. ${isClosed ? 'REJECT: If it looks hallucinated or nonsensical, reject it.\n   Reason: hallucination_detected | not_a_real_' + ctx.fieldKey : 'KEEP_NEW: If it\'s a genuinely valid new value for this field,\n   confirm it. Explain why it\'s legitimate.\n3. REJECT: If it looks hallucinated, reject it.'}
${isClosed ? '\nYou MUST NOT invent new values for a closed enum.' : ''}
Return: { decisions: [{ value, decision, resolved_to, confidence, reasoning }] }`;

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
  const templateType = ctx.fieldRule?.parse?.template || 'text_field';

  const userMessage = `The field '${ctx.fieldKey}' (type: ${expectedType}) received a value that
could not be deterministically converted:
  Value: ${JSON.stringify(ctx.value)}
  Expected type: ${expectedType}
  Template: ${templateType}

Your task:
1. If the value contains the answer in a different format, extract it.
   e.g. "twenty grams" → 20, "around 3.5 inches" → 88.9 (mm)
2. If the value is genuinely unknown, return "unk".
3. If the value is nonsensical or hallucinated, return null with
   reason: "hallucination_detected".

Return: { resolved: <value>, confidence: 0.0-1.0, reasoning: "..." }`;

  return {
    promptId: 'P3',
    userMessage,
    params: { rawValue: ctx.value, expectedType, templateType },
  };
}

function buildFormatPrompt(rejection, ctx) {
  const templateType = ctx.fieldRule?.parse?.template || 'text_field';

  const userMessage = `The field '${ctx.fieldKey}' value failed format validation after normalization:
  Value: '${ctx.value}'
  Expected format: ${rejection.detail.reason || 'unknown'}
  Template: ${templateType}

The value survived lowercase + hyphen + token_map normalization but
still doesn't match the required format. This suggests the original
LLM output was genuinely malformed.

Decide:
1. If you can extract a valid value, return it.
2. If this looks like a hallucination, return null + reason.
3. If the value is unknown/missing, return 'unk'.

Return: { resolved: <value>, confidence: 0.0-1.0, reasoning: '...' }`;

  return {
    promptId: 'P4',
    userMessage,
    params: { normalizedValue: ctx.value, templateType, formatReason: rejection.detail.reason },
  };
}

function buildComponentPrompt(rejection, ctx) {
  const componentType = ctx.fieldRule?.parse?.component_type || ctx.fieldKey;
  const items = ctx.componentDb?.items || [];
  const entityList = items.map(i => i.name).join(', ');

  const userMessage = `The field '${ctx.fieldKey}' (component_reference for '${componentType}') could not
resolve the value against the component database:
  Value: '${rejection.detail.value || ctx.value}'

Known ${componentType} entities (${items.length}):
${entityList || '(empty)'}

Decide:
1. MAP_TO_EXISTING: If this is a known component under a different name/alias.
2. KEEP_NEW: If this is a legitimate component not yet in our DB (provide
   maker + canonical name so we can add it).
3. REJECT: If this looks hallucinated or is not a real ${componentType}.

Return: { decision, resolved_to, confidence, reasoning }`;

  return {
    promptId: 'P5',
    userMessage,
    params: { rawValue: rejection.detail.value || ctx.value, componentType, entityList, count: items.length },
  };
}

function buildRangePrompt(rejection, ctx) {
  const { min, max, actual } = rejection.detail;
  const unit = ctx.fieldRule?.contract?.unit || '';

  const userMessage = `The field '${ctx.fieldKey}' value is outside the expected range:
  Value: ${actual ?? ctx.value}${unit ? ' ' + unit : ''}
  Expected range: ${min != null ? min : '—'} to ${max != null ? max : '—'}${unit ? ' ' + unit : ''}

This may indicate a hallucinated magnitude, a unit mismatch, or a data entry error.

Decide:
1. If you can determine the correct value, return it.
2. If the value is genuinely unknown, return "unk".
3. If this looks hallucinated, reject it.

Return: { resolved: <value>, confidence: 0.0-1.0, reasoning: '...' }`;

  return {
    promptId: 'P7',
    userMessage,
    params: { value: actual ?? ctx.value, unit, bounds: { min, max } },
  };
}

function buildUnitPrompt(rejection, ctx) {
  const { expected, detected } = rejection.detail;

  const userMessage = `The field '${ctx.fieldKey}' requires unit '${expected}' but the value
was given in '${detected}':
  Value: ${JSON.stringify(ctx.value)}
  Expected unit: ${expected}
  Detected unit: ${detected}

Convert the value to ${expected} and return the numeric result.
If the value cannot be meaningfully converted, return 'unk'.
Return: { resolved: number, confidence: 0.0-1.0, reasoning: '...' }`;

  return {
    promptId: 'unit_conversion',
    userMessage,
    params: { rawValue: ctx.value, expectedUnit: expected, detectedUnit: detected },
  };
}
