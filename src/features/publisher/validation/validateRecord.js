import { validateField } from './validateField.js';
import { checkConstraints } from './checks/checkConstraints.js';

/**
 * Full product validation. Validates all fields, then runs cross-field constraints.
 * Pure function — no DB, no LLM, no side effects.
 *
 * @param {{ fields: Record<string, *>, fieldRules: Record<string, object>, knownValues?: object, componentDbs?: object, crossRules?: object }} opts
 * @returns {{ valid: boolean, fields: Record<string, *>, perField: Record<string, object>, crossFieldFailures: object[] }}
 */
export function validateRecord({ fields, fieldRules, knownValues, componentDbs, crossRules, consistencyMode }) {
  const safeFields = fields || {};
  const safeRules = fieldRules || {};
  const perField = {};
  const validatedFields = {};

  // Step 1: validate each field through the per-field pipeline
  for (const fieldKey of Object.keys(safeFields)) {
    const fieldRule = safeRules[fieldKey] || null;
    const enumData = knownValues?.enums?.[fieldKey] || null;
    const fieldResult = validateField({ fieldKey, value: safeFields[fieldKey], fieldRule, knownValues: enumData, consistencyMode });

    perField[fieldKey] = fieldResult;
    validatedFields[fieldKey] = fieldResult.value;
  }

  // Step 2: cross-field constraints on the full resolved set
  const constraintResult = checkConstraints(validatedFields, crossRules, componentDbs);

  // Step 3: determine overall validity
  const allFieldsValid = Object.values(perField).every(r => r.valid);
  const hasRejectFailure = constraintResult.failures.some(f => f.action === 'reject_candidate');
  const valid = allFieldsValid && !hasRejectFailure;

  return {
    valid,
    fields: validatedFields,
    perField,
    crossFieldFailures: constraintResult.failures,
  };
}
