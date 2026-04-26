// Shared persistence helpers for the split UI stores (theme/category/settings).
// Each store owns its own keys; this file exists only to deduplicate the
// localStorage I/O surface and the legacy-sessionStorage migration path.

function readLocalValue(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function readLegacySessionValue(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) || '';
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

function clearLegacySessionValue(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

export function readPersistedValue(key: string): string {
  const local = readLocalValue(key);
  if (local) return local;
  const legacy = readLegacySessionValue(key);
  if (legacy) {
    writeLocalValue(key, legacy);
    clearLegacySessionValue(key);
  }
  return legacy;
}

export function writePersistedValue(key: string, value: string): void {
  writeLocalValue(key, value);
  clearLegacySessionValue(key);
}

export function readPersistedBool(key: string, fallback: boolean): boolean {
  const value = readPersistedValue(key);
  if (!value) return fallback;
  return value === 'true';
}

export function readPersistedLocal(key: string): string {
  return readLocalValue(key);
}
