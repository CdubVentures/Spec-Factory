function normalizeFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFingerprintValue(entry));
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(input).sort((left, right) => left.localeCompare(right));
    for (const key of keys) {
      const entry = input[key];
      if (entry === undefined) continue;
      normalized[key] = normalizeFingerprintValue(entry);
    }
    return normalized;
  }
  return value;
}

export function autoSaveFingerprint(value: unknown): string {
  try {
    return JSON.stringify(normalizeFingerprintValue(value));
  } catch {
    return '';
  }
}
