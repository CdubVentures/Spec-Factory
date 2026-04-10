import { validateField } from './validateField.js';

/**
 * Per-field product validation. Validates all fields through the 12-step pipeline.
 * Pure function — no DB, no LLM, no side effects.
 * Cross-field constraints are out of scope for the validator.
 *
 * @param {{ fields: Record<string, *>, fieldRules: Record<string, object>, knownValues?: object, consistencyMode?: string }} opts
 * @returns {{ valid: boolean, fields: Record<string, *>, perField: Record<string, object> }}
 */
export function validateRecord({ fields, fieldRules, knownValues, consistencyMode, appDb }) {
  const safeFields = fields || {};
  const safeRules = fieldRules || {};
  const perField = {};
  const validatedFields = {};

  for (const fieldKey of Object.keys(safeFields)) {
    const fieldRule = safeRules[fieldKey] || null;
    const enumData = knownValues?.enums?.[fieldKey] || null;
    const fieldResult = validateField({ fieldKey, value: safeFields[fieldKey], fieldRule, knownValues: enumData, consistencyMode, appDb });

    perField[fieldKey] = fieldResult;
    validatedFields[fieldKey] = fieldResult.value;
  }

  const valid = Object.values(perField).every(r => r.valid);

  return { valid, fields: validatedFields, perField };
}
