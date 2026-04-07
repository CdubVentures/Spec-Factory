import { validateField } from '../validation/validateField.js';
import { validateRecord } from '../validation/validateRecord.js';
import { buildRepairPrompt, buildCrossFieldRepairPrompt } from './promptBuilder.js';
import { parseRepairResponse, applyRepairDecisions } from './repairResponseSchema.js';

/**
 * Per-field LLM repair orchestrator (Attempt 2).
 * Builds prompt from rejections → calls LLM → parses response → re-validates.
 *
 * @param {{ validationResult: object, fieldKey: string, fieldRule: object, knownValues?: object, componentDb?: object, callLlm: Function }} opts
 * @returns {Promise<{ status: string, value: *, confidence: number, decisions: object[]|null, revalidation: object|null, promptId: string|null, flaggedForReview: boolean, error?: string }>}
 */
export async function repairField({ validationResult, fieldKey, fieldRule, knownValues, componentDb, callLlm }) {
  // Step 1: Short-circuit if already valid
  if (validationResult.valid) {
    return noRepairNeeded(validationResult.value);
  }

  // Step 2: Build prompt from rejections
  const prompt = buildRepairPrompt({
    rejections: validationResult.rejections,
    value: validationResult.value,
    fieldKey,
    fieldRule,
    knownValues,
    componentDb,
  });
  if (!prompt) {
    return promptSkipped(validationResult.value);
  }

  // Step 3: Call LLM
  let llmRaw;
  try {
    llmRaw = await callLlm({ system: prompt.system, user: prompt.user, jsonSchema: prompt.jsonSchema, promptId: prompt.promptId, fieldKey });
  } catch (err) {
    return stillFailed(validationResult.value, prompt.promptId, err.message);
  }

  // Step 4: Parse response
  const parsed = parseRepairResponse(llmRaw);
  if (!parsed.ok) {
    return stillFailed(validationResult.value, prompt.promptId, parsed.error);
  }

  // Step 5: If LLM says rerun, return early
  if (parsed.data.status === 'rerun_recommended') {
    return {
      status: 'rerun_recommended',
      value: validationResult.value,
      confidence: 0,
      decisions: parsed.data.decisions,
      revalidation: null,
      promptId: prompt.promptId,
      flaggedForReview: false,
    };
  }

  // Step 6: Apply decisions
  const shape = fieldRule?.contract?.shape || 'scalar';
  const applied = applyRepairDecisions({
    decisions: parsed.data.decisions,
    currentValue: validationResult.value,
    shape,
  });

  // Step 7: Re-validate through validateField (closed loop)
  const revalidation = validateField({ fieldKey, value: applied.value, fieldRule, knownValues, componentDb });

  // Step 8: Determine status
  const status = revalidation.valid ? 'repaired' : 'still_failed';
  const flaggedForReview = applied.applied.some(d => d.flagged);

  return {
    status,
    value: revalidation.valid ? revalidation.value : validationResult.value,
    confidence: applied.confidence,
    decisions: parsed.data.decisions,
    revalidation: {
      valid: revalidation.valid,
      value: revalidation.value,
      repairs: revalidation.repairs,
      rejections: revalidation.rejections,
    },
    promptId: prompt.promptId,
    flaggedForReview,
  };
}

/**
 * Cross-field LLM repair orchestrator (P6).
 * Builds P6 prompt from cross-field failures → calls LLM → re-validates via validateRecord.
 *
 * @param {{ crossFieldFailures: object[], fields: object, productName: string, fieldRules: object, knownValues?: object, componentDbs?: object, callLlm: Function }} opts
 * @returns {Promise<{ status: string, repairs: object[]|null, revalidation: object|null, promptId: string|null, flaggedForReview: boolean, error?: string }>}
 */
export async function repairCrossField({ crossFieldFailures, fields, productName, fieldRules, knownValues, componentDbs, callLlm }) {
  if (!crossFieldFailures || crossFieldFailures.length === 0) {
    return { status: 'no_repair_needed', repairs: null, revalidation: null, promptId: null, flaggedForReview: false };
  }

  const prompt = buildCrossFieldRepairPrompt({ crossFieldFailures, fields, productName });
  if (!prompt) {
    return { status: 'no_repair_needed', repairs: null, revalidation: null, promptId: null, flaggedForReview: false };
  }

  let llmRaw;
  try {
    llmRaw = await callLlm({ system: prompt.system, user: prompt.user, jsonSchema: prompt.jsonSchema, promptId: 'P6', fieldKey: 'cross_field' });
  } catch (err) {
    return { status: 'still_failed', repairs: null, revalidation: null, promptId: 'P6', flaggedForReview: false, error: err.message };
  }

  const parsed = parseRepairResponse(llmRaw);
  if (!parsed.ok) {
    return { status: 'still_failed', repairs: null, revalidation: null, promptId: 'P6', flaggedForReview: false, error: parsed.error };
  }

  if (parsed.data.status === 'rerun_recommended') {
    return { status: 'rerun_recommended', repairs: null, revalidation: null, promptId: 'P6', flaggedForReview: false };
  }

  // Apply cross-field decisions to fields
  const repairedFields = { ...fields };
  const repairs = [];
  for (const dec of parsed.data.decisions) {
    if (dec.decision === 'map_to_existing' && dec.resolved_to != null && dec.confidence >= 0.5) {
      repairedFields[dec.value] = dec.resolved_to;
      repairs.push({ field: dec.value, old_value: fields[dec.value], new_value: dec.resolved_to, confidence: dec.confidence, reasoning: dec.reasoning });
    }
  }

  // Re-validate through validateRecord
  const revalidation = validateRecord({ fields: repairedFields, fieldRules, knownValues, componentDbs });
  const status = revalidation.valid ? 'repaired' : 'still_failed';
  const flaggedForReview = repairs.some(r => r.confidence < 0.8);

  return { status, repairs, revalidation, promptId: 'P6', flaggedForReview };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function noRepairNeeded(value) {
  return { status: 'no_repair_needed', value, confidence: 1.0, decisions: null, revalidation: null, promptId: null, flaggedForReview: false };
}

function promptSkipped(value) {
  return { status: 'prompt_skipped', value, confidence: 0, decisions: null, revalidation: null, promptId: null, flaggedForReview: false };
}

function stillFailed(value, promptId, error) {
  return { status: 'still_failed', value, confidence: 0, decisions: null, revalidation: null, promptId, flaggedForReview: false, error };
}
