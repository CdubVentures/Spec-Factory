function toStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);
}

function toOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function getWorkbookMapValidationOutcome(result) {
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

export function assertWorkbookMapValidationOrThrow({ result, actionLabel = 'save' }) {
  const outcome = getWorkbookMapValidationOutcome(result);
  if (outcome.valid) return outcome;

  const preview = outcome.errors.slice(0, 3).join('; ');
  const extraCount = Math.max(0, outcome.errors.length - 3);
  const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
  const detail = preview || 'unknown validation error';
  throw new Error(`Workbook map validation failed before ${actionLabel}: ${detail}${suffix}`);
}

export function resolveWorkbookMapPayloadForSave({ result, fallback }) {
  const outcome = getWorkbookMapValidationOutcome(result);
  return toOptionalObject(outcome.normalized) || fallback;
}

