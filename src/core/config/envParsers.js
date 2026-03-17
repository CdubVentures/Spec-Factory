// WHY: Pure env-parsing utilities used by config assembly.
// Extracted from src/config.js (Phase 1) to separate generic parsing from domain logic.

export function parseIntEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : defaultValue;
}

export function parseFloatEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : defaultValue;
}

export function parseBoolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const norm = String(raw).trim().toLowerCase();
  return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on';
}

export function parseJsonEnv(name, defaultValue = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function toTokenInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

export function parseTokenPresetList(value, fallback = []) {
  const parsed = String(value || '')
    .split(/[,\s]+/g)
    .map((item) => Number.parseInt(String(item || ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.max(128, Math.min(262144, Number(n))))
    .sort((a, b) => a - b);
  if (parsed.length === 0) {
    return [...fallback];
  }
  return [...new Set(parsed)];
}

export function clampIntFromMap(source, key, fallback, min, max) {
  const parsed = Number.parseInt(String(source?.[key] ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function clampFloatFromMap(source, key, fallback, min, max) {
  const parsed = Number.parseFloat(String(source?.[key] ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
