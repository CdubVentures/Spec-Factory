function toStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);
}

function toOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isLegacyMapOnlyCompileError(errorText) {
  const text = String(errorText || '').trim();
  if (!text) return false;
  if (text === 'key_list: sheet is required') return true;
  return text === "component_sources: invalid property mapping column '' for sheet ''";
}

function canBypassLegacyCompileValidation(outcome) {
  if (!outcome || outcome.valid) return false;
  if (!Array.isArray(outcome.errors) || outcome.errors.length === 0) return false;
  return outcome.errors.every((errorText) => isLegacyMapOnlyCompileError(errorText));
}

export function getFieldStudioMapValidationOutcome(result) {
  const payload = toOptionalObject(result) || {};
  const errors = toStringArray(payload.errors);
  const warnings = toStringArray(payload.warnings);

  let valid = true;
  if (typeof payload.valid === 'boolean') {
    valid = payload.valid;
  } else if (typeof payload.ok === 'boolean') {
    valid = payload.ok;
  } else if (errors.length > 0) {
    valid = false;
  }

  return {
    valid,
    errors,
    warnings,
    normalized: toOptionalObject(payload.normalized),
  };
}

export function assertFieldStudioMapValidationOrThrow({ result, actionLabel = 'save', allowLegacyCompileBypass = false }) {
  const outcome = getFieldStudioMapValidationOutcome(result);
  if (outcome.valid) return outcome;
  if (allowLegacyCompileBypass && actionLabel === 'compile' && canBypassLegacyCompileValidation(outcome)) {
    return {
      ...outcome,
      valid: true,
      warnings: [
        ...outcome.warnings,
        'legacy map validation mismatch ignored for compile preflight; compile will run and enforce runtime validation',
      ],
    };
  }

  const preview = outcome.errors.slice(0, 3).join('; ');
  const extraCount = Math.max(0, outcome.errors.length - 3);
  const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
  const detail = preview || 'unknown validation error';
  throw new Error(`Field Studio map validation failed before ${actionLabel}: ${detail}${suffix}`);
}

export function resolveFieldStudioMapPayloadForSave({ result, fallback }) {
  const outcome = getFieldStudioMapValidationOutcome(result);
  return toOptionalObject(outcome.normalized) || fallback;
}
