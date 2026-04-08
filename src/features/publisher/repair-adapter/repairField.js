import { validateField } from '../validation/validateField.js';
import { validateRecord } from '../validation/validateRecord.js';
import { buildRepairPrompt, buildCrossFieldRepairPrompt } from './promptBuilder.js';
import { parseRepairResponse, applyRepairDecisions } from './repairResponseSchema.js';

/**
 * Per-field LLM repair orchestrator (Attempt 2).
 * Builds prompt from rejections -> calls LLM -> parses response -> re-validates.
 * WHY: No confidence gating. Re-validation through the 13-step pipeline is the only gate.
 *
 * @param {{ validationResult: object, fieldKey: string, fieldRule: object, knownValues?: object, callLlm: Function }} opts
 * @returns {Promise<{ status: string, value: *, decisions: object[]|null, revalidation: object|null, promptId: string|null, error?: string }>}
 */
export async function repairField({ validationResult, fieldKey, fieldRule, knownValues, callLlm, consistencyMode }) {
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
      decisions: parsed.data.decisions,
      revalidation: null,
      promptId: prompt.promptId,
    };
  }

  // Step 6: Apply decisions (no confidence gating — all decisions applied)
  const shape = fieldRule?.contract?.shape || 'scalar';
  const applied = applyRepairDecisions({
    decisions: parsed.data.decisions,
    currentValue: validationResult.value,
    shape,
  });

  // Step 7: Re-validate through validateField (closed loop — the ONLY gate)
  // WHY: LLM keep_new decisions confirm new values — add them to known set so re-validation passes
  let revalKnownValues = knownValues;
  const keepNew = parsed.data.decisions.filter(d => d.decision === 'keep_new' && d.resolved_to != null);
  if (keepNew.length > 0 && knownValues && Array.isArray(knownValues.values)) {
    revalKnownValues = { ...knownValues, values: [...knownValues.values, ...keepNew.map(d => d.resolved_to)] };
  }
  const revalidation = validateField({ fieldKey, value: applied.value, fieldRule, knownValues: revalKnownValues, consistencyMode });

  // Step 8: Binary outcome — re-validation is the only gate
  const status = revalidation.valid ? 'repaired' : 'still_failed';

  return {
    status,
    value: revalidation.valid ? revalidation.value : validationResult.value,
    decisions: parsed.data.decisions,
    revalidation: {
      valid: revalidation.valid,
      value: revalidation.value,
      repairs: revalidation.repairs,
      rejections: revalidation.rejections,
    },
    promptId: prompt.promptId,
  };
}

/**
 * Cross-field LLM repair orchestrator (P6).
 * Builds P6 prompt from cross-field failures -> calls LLM -> re-validates via validateRecord.
 *
 * @param {{ crossFieldFailures: object[], fields: object, productName: string, fieldRules: object, knownValues?: object, componentDbs?: object, callLlm: Function }} opts
 * @returns {Promise<{ status: string, repairs: object[]|null, revalidation: object|null, promptId: string|null, error?: string }>}
 */
export async function repairCrossField({ crossFieldFailures, fields, productName, fieldRules, knownValues, crossRules, callLlm, consistencyMode }) {
  if (!crossFieldFailures || crossFieldFailures.length === 0) {
    return { status: 'no_repair_needed', repairs: null, revalidation: null, promptId: null };
  }

  const prompt = buildCrossFieldRepairPrompt({ crossFieldFailures, fields, productName });
  if (!prompt) {
    return { status: 'no_repair_needed', repairs: null, revalidation: null, promptId: null };
  }

  let llmRaw;
  try {
    llmRaw = await callLlm({ system: prompt.system, user: prompt.user, jsonSchema: prompt.jsonSchema, promptId: 'P6', fieldKey: 'cross_field' });
  } catch (err) {
    return { status: 'still_failed', repairs: null, revalidation: null, promptId: 'P6', error: err.message };
  }

  const parsed = parseRepairResponse(llmRaw);
  if (!parsed.ok) {
    return { status: 'still_failed', repairs: null, revalidation: null, promptId: 'P6', error: parsed.error };
  }

  if (parsed.data.status === 'rerun_recommended') {
    return { status: 'rerun_recommended', repairs: null, revalidation: null, promptId: 'P6' };
  }

  // Apply all cross-field decisions to fields
  const repairedFields = { ...fields };
  const repairs = [];
  for (const dec of parsed.data.decisions) {
    if ((dec.decision === 'map_to_existing' || dec.decision === 'keep_new') && dec.resolved_to != null) {
      repairedFields[dec.value] = dec.resolved_to;
      repairs.push({ field: dec.value, old_value: fields[dec.value], new_value: dec.resolved_to, reasoning: dec.reasoning });
    } else if (dec.decision === 'set_unk') {
      repairedFields[dec.value] = 'unk';
      repairs.push({ field: dec.value, old_value: fields[dec.value], new_value: 'unk', reasoning: dec.reasoning });
    }
    // reject = leave field unchanged (LLM says the constraint itself is wrong)
  }

  // Re-validate through validateRecord with crossRules — the ONLY gate
  const revalidation = validateRecord({ fields: repairedFields, fieldRules, knownValues, crossRules, consistencyMode });
  const status = revalidation.valid ? 'repaired' : 'still_failed';

  return { status, repairs, revalidation, promptId: 'P6' };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function noRepairNeeded(value) {
  return { status: 'no_repair_needed', value, decisions: null, revalidation: null, promptId: null };
}

function promptSkipped(value) {
  return { status: 'prompt_skipped', value, decisions: null, revalidation: null, promptId: null };
}

function stillFailed(value, promptId, error) {
  return { status: 'still_failed', value, decisions: null, revalidation: null, promptId, error };
}
