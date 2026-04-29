// Shared persistence helpers for the split UI stores (theme/category/settings).
// Each store owns its own keys; this file exists only to deduplicate the
// localStorage I/O surface.

function readLocalValue(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocalValue(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function readPersistedValue(key: string): string {
  return readLocalValue(key);
}

export function writePersistedValue(key: string, value: string): void {
  writeLocalValue(key, value);
}

export function readPersistedBool(key: string, fallback: boolean): boolean {
  const value = readPersistedValue(key);
  if (!value) return fallback;
  return value === 'true';
}

export function readPersistedLocal(key: string): string {
  return readLocalValue(key);
}
