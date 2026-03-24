// WHY: SSOT for pure type-guard and text-normalization primitives.
// Every domain-helper file (engineTextHelpers, compilerPrimitives, publishPrimitives,
// reviewNormalization, compileUtils, convergenceHelpers, runtimeOpsEventPrimitives)
// must import from here instead of defining its own copy.

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeFieldKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
