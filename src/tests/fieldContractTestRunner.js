/**
 * fieldContractTestRunner.js — Per-key field contract audit runner.
 *
 * Runs validateField + buildRepairPrompt for every field key against
 * derived bad/good values. No products, no sources, no consensus — just
 * the validator and prompt builder per field key.
 *
 * O(1) scaling: adding a field key = zero code changes here.
 */

import { validateField } from '../features/publisher/validation/validateField.js';
import { buildRepairPrompt } from '../features/publisher/repair-adapter/promptBuilder.js';
import { PHASE_REGISTRY } from '../features/publisher/validation/phaseRegistry.js';
import { shouldBlockUnkPublish } from '../features/publisher/validation/shouldBlockUnkPublish.js';
import { deriveTestValues } from './deriveFailureValues.js';

/**
 * Run the full per-key field contract audit.
 *
 * @param {{ fieldRules: object, knownValues: object, componentDbs: object }} opts
 * @returns {{
 *   results: FieldTestResult[],
 *   summary: { totalFields: number, totalChecks: number, passCount: number, failCount: number }
 * }}
 */
export function runFieldContractTests({ fieldRules, knownValues, componentDbs, consistencyMode, appDb }) {
  const fields = fieldRules?.fields || {};
  const fieldKeys = Object.keys(fields);
  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const fieldKey of fieldKeys) {
    const fieldRule = fields[fieldKey];
    const kv = knownValues?.enums?.[fieldKey] || null;
    const compType = fieldRule?.parse?.component_type || null;
    const compDb = compType
      ? (componentDbs?.[compType] || componentDbs?.[compType + 's'] || null)
      : null;

    const derived = deriveTestValues(fieldKey, fieldRule, kv, compDb);
    const checks = [];

    // ── Good value check ──────────────────────────────────────────────
    const goodResult = validateField({
      fieldKey, value: derived.good.value, fieldRule, knownValues: kv, componentDb: compDb, consistencyMode, appDb,
    });
    const goodPass = goodResult.valid;
    checks.push({
      type: 'good',
      pass: goodPass,
      value: derived.good.value,
      description: derived.good.description,
      detail: goodPass
        ? 'valid'
        : `rejected: ${goodResult.rejections.map(r => r.reason_code).join(', ')}`,
      validatorOutput: {
        valid: goodResult.valid,
        value: goodResult.value,
        repairs: goodResult.repairs,
        rejections: goodResult.rejections,
      },
    });
    goodPass ? passCount++ : failCount++;

    // ── Bad value checks ──────────────────────────────────────────────
    for (const reject of derived.rejects) {
      const badResult = validateField({
        fieldKey, value: reject.value, fieldRule, knownValues: kv, componentDb: compDb, consistencyMode, appDb,
      });

      const hasExpectedRejection = badResult.rejections.some(
        r => r.reason_code === reject.expectedCode,
      );
      const pass = !badResult.valid && hasExpectedRejection;

      // Build prompt for the rejection (if applicable)
      let prompt = null;
      if (!badResult.valid) {
        const promptResult = buildRepairPrompt({
          rejections: badResult.rejections,
          value: reject.value,
          fieldKey,
          fieldRule,
          knownValues: kv,
          componentDb: compDb,
        });
        prompt = promptResult;
      }

      checks.push({
        type: 'reject',
        pass,
        value: reject.value,
        expectedCode: reject.expectedCode,
        actualCodes: badResult.rejections.map(r => r.reason_code),
        description: reject.description,
        detail: pass
          ? `rejected with ${reject.expectedCode}`
          : badResult.valid
            ? `expected rejection ${reject.expectedCode} but value passed`
            : `expected ${reject.expectedCode}, got ${badResult.rejections.map(r => r.reason_code).join(', ')}`,
        prompt,
        validatorOutput: {
          valid: badResult.valid,
          value: badResult.value,
          repairs: badResult.repairs,
          rejections: badResult.rejections,
        },
      });
      pass ? passCount++ : failCount++;
    }

    // ── Repair value checks ───────────────────────────────────────────
    for (const repair of derived.repairs) {
      const repairResult = validateField({
        fieldKey, value: repair.value, fieldRule, knownValues: kv, componentDb: compDb, consistencyMode, appDb,
      });

      const hasRepair = repairResult.repairs.some(r =>
        r.step === repair.knob || r.rule === repair.knob ||
        r.rule?.includes(repair.knob) || r.step?.includes(repair.knob),
      );
      // WHY: allow_new_components is a pass-through, not a repair step.
      // Other repairs: verify the repair step FIRED. Later steps (e.g. enum check)
      // may add rejections that don't invalidate this repair knob's behavior.
      const isPassThrough = repair.knob === 'allow_new_components';
      const pass = isPassThrough
        ? repairResult.valid
        : hasRepair;

      checks.push({
        type: 'repair',
        pass,
        value: repair.value,
        knob: repair.knob,
        expectedRepair: repair.expectedRepair,
        actualValue: repairResult.value,
        description: repair.description,
        detail: pass
          ? `repaired via ${repair.knob}`
          : !repairResult.valid
            ? `rejected: ${repairResult.rejections.map(r => r.reason_code).join(', ')}`
            : `no ${repair.knob} repair found in repairs: ${repairResult.repairs.map(r => r.step || r.rule).join(', ')}`,
        validatorOutput: {
          valid: repairResult.valid,
          value: repairResult.value,
          repairs: repairResult.repairs,
          rejections: repairResult.rejections,
        },
      });
      pass ? passCount++ : failCount++;
    }

    results.push({ fieldKey, checks, knobs: extractAllKnobs(fieldRule, kv, compDb) });
  }

  // WHY: Phase descriptions are the source of truth for knob tooltips.
  // Send once, frontend looks up by step number.
  const phases = PHASE_REGISTRY.map(p => ({
    id: p.id,
    title: p.title,
    order: p.order,
    description: p.description,
    behaviorNote: p.behaviorNote,
  }));

  return {
    results,
    phases,
    summary: {
      totalFields: fieldKeys.length,
      totalChecks: passCount + failCount,
      passCount,
      failCount,
    },
  };
}

// ── Knob extraction ─────────────────────────────────────────────────────
// WHY: Shows EVERY configured parameter on the field rule — not just "active" ones.
// The validator runs every step; the UI should show every knob.

function extractAllKnobs(fieldRule, knownValues, componentDb) {
  const c = fieldRule?.contract || {};
  const p = fieldRule?.parse || {};
  const e = fieldRule?.enum || {};
  const pri = fieldRule?.priority || {};
  const comp = fieldRule?.component || {};
  const knobs = [];

  // contract.* — step numbers match phaseRegistry order (0-10)
  if (c.shape) knobs.push({ knob: 'contract.shape', value: c.shape, step: 1, action: 'reject', code: 'wrong_shape' });
  if (c.type) knobs.push({ knob: 'contract.type', value: c.type, step: 3, action: 'reject+llm', code: 'wrong_type', prompt: 'P3' });
  if (c.unit && c.unit !== 'none') knobs.push({ knob: 'contract.unit', value: c.unit, step: 2, action: 'reject+llm', code: 'wrong_unit', prompt: 'unit_conversion' });
  if (c.range?.min != null || c.range?.max != null) {
    knobs.push({ knob: 'contract.range', value: `${c.range.min ?? '—'} to ${c.range.max ?? '—'}`, step: 9, action: 'reject+llm', code: 'out_of_range', prompt: 'P7' });
  }
  if (c.rounding?.decimals != null) {
    knobs.push({ knob: 'contract.rounding', value: `${c.rounding.decimals} decimals (${c.rounding.mode || 'nearest'})`, step: 7, action: 'deterministic', code: null });
  }
  if (c.list_rules?.dedupe) knobs.push({ knob: 'contract.list_rules.dedupe', value: 'true', step: 6, action: 'deterministic', code: null });
  if (c.list_rules?.sort && c.list_rules.sort !== 'none') knobs.push({ knob: 'contract.list_rules.sort', value: c.list_rules.sort, step: 6, action: 'deterministic', code: null });
  // parse.*
  if (p.token_map && Object.keys(p.token_map).length > 0) {
    knobs.push({ knob: 'parse.token_map', value: `${Object.keys(p.token_map).length} entries`, step: 4, action: 'deterministic', code: null });
  }

  // enum.* — always show policy and strategy, not just when "active"
  const enumPolicy = knownValues?.policy || e.policy;
  if (enumPolicy) {
    if (enumPolicy === 'closed') {
      knobs.push({ knob: 'enum.policy', value: 'closed', step: 8, action: 'reject+llm', code: 'enum_value_not_allowed', prompt: 'P1' });
    } else if (enumPolicy === 'open_prefer_known') {
      knobs.push({ knob: 'enum.policy', value: 'open_prefer_known', step: 8, action: 'reject+llm', code: 'unknown_enum_prefer_known', prompt: 'P2' });
    } else {
      knobs.push({ knob: 'enum.policy', value: enumPolicy, step: 8, action: 'info', code: null });
    }
  }
  if (e.match?.format_hint) knobs.push({ knob: 'enum.match.format_hint', value: e.match.format_hint, step: 5, action: 'reject+llm', code: 'format_mismatch', prompt: 'P4' });
  if (knownValues?.values?.length > 0) {
    knobs.push({ knob: 'enum.known_values', value: `${knownValues.values.length} values`, step: 8, action: 'info', code: null });
  }

  // priority.*
  if (shouldBlockUnkPublish(fieldRule)) knobs.push({ knob: 'priority.required_level', value: pri.required_level, step: 10, action: 'reject', code: 'unk_blocks_publish' });

  // component.* — informational, no dedicated validation step in pipeline
  if (p.component_type) {
    const itemCount = Object.keys(componentDb?.entries || {}).length;
    knobs.push({ knob: 'component.type', value: `${p.component_type} (${itemCount} items in DB)`, step: null, action: 'info', code: null });
    if (comp.allow_new_components) knobs.push({ knob: 'component.allow_new_components', value: 'true', step: null, action: 'pass-through', code: null });
  }

  return knobs;
}
