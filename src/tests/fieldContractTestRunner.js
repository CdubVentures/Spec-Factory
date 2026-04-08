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
export function runFieldContractTests({ fieldRules, knownValues, componentDbs }) {
  const fields = fieldRules?.fields || {};
  const fieldKeys = Object.keys(fields);
  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const fieldKey of fieldKeys) {
    const fieldRule = fields[fieldKey];
    const kv = knownValues?.enums?.[fieldKey] || null;
    const template = fieldRule?.parse?.template || 'text_field';
    const compType = template === 'component_reference' ? fieldKey : null;
    const compDb = compType
      ? (componentDbs?.[compType] || componentDbs?.[compType + 's'] || null)
      : null;

    const derived = deriveTestValues(fieldKey, fieldRule, kv, compDb);
    const checks = [];

    // ── Good value check ──────────────────────────────────────────────
    const goodResult = validateField({
      fieldKey, value: derived.good.value, fieldRule, knownValues: kv, componentDb: compDb,
    });
    const goodPass = goodResult.valid;
    checks.push({
      type: 'good',
      pass: goodPass,
      value: derived.good.value,
      detail: goodPass
        ? 'valid'
        : `rejected: ${goodResult.rejections.map(r => r.reason_code).join(', ')}`,
    });
    goodPass ? passCount++ : failCount++;

    // ── Bad value checks ──────────────────────────────────────────────
    for (const reject of derived.rejects) {
      const badResult = validateField({
        fieldKey, value: reject.value, fieldRule, knownValues: kv, componentDb: compDb,
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
      });
      pass ? passCount++ : failCount++;
    }

    // ── Repair value checks ───────────────────────────────────────────
    for (const repair of derived.repairs) {
      const repairResult = validateField({
        fieldKey, value: repair.value, fieldRule, knownValues: kv, componentDb: compDb,
      });

      const hasRepair = repairResult.repairs.some(r =>
        r.step === repair.knob || r.rule === repair.knob ||
        r.rule?.includes(repair.knob) || r.step?.includes(repair.knob),
      );
      // WHY: allow_new_components is a pass-through, not a repair step
      const isPassThrough = repair.knob === 'allow_new_components';
      const pass = isPassThrough
        ? repairResult.valid
        : repairResult.valid && hasRepair;

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
      });
      pass ? passCount++ : failCount++;
    }

    results.push({ fieldKey, checks });
  }

  return {
    results,
    summary: {
      totalFields: fieldKeys.length,
      totalChecks: passCount + failCount,
      passCount,
      failCount,
    },
  };
}
