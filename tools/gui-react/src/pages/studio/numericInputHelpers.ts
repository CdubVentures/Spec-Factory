export function clampNumber(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safeValue));
}

export function parseIntegerInput(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFloatInput(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoundedIntInput(
  value: unknown,
  min: number,
  max: number,
  fallback = min,
): number {
  const parsed = parseIntegerInput(value);
  const safeValue = parsed === null ? fallback : parsed;
  return clampNumber(safeValue, min, max);
}

export function parseBoundedFloatInput(
  value: unknown,
  min: number,
  max: number,
  fallback = min,
): number {
  const parsed = parseFloatInput(value);
  const safeValue = parsed === null ? fallback : parsed;
  return clampNumber(safeValue, min, max);
}

export function parseOptionalPositiveIntInput(value: unknown): number | null {
  const parsed = parseIntegerInput(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}
