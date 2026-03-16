import { parseIntegerInput } from './numericInputHelpers';

export function getN(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce(
    (value: unknown, key) => (
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[key]
        : undefined
    ),
    obj,
  );
}

export function strN(obj: Record<string, unknown>, path: string, fallback = ''): string {
  const value = getN(obj, path);
  return value != null ? String(value) : fallback;
}

export function numN(obj: Record<string, unknown>, path: string, fallback = 0): number {
  const value = getN(obj, path);
  if (typeof value === 'number') return value;
  const parsed = parseIntegerInput(value);
  return parsed === null ? fallback : parsed;
}

export function boolN(obj: Record<string, unknown>, path: string, fallback = false): boolean {
  const value = getN(obj, path);
  return typeof value === 'boolean' ? value : fallback;
}

export function arrN(obj: Record<string, unknown>, path: string): string[] {
  const value = getN(obj, path);
  return Array.isArray(value) ? value.map(String) : [];
}
