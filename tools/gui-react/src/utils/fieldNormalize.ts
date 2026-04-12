import { UNKNOWN_VALUES } from './constants.ts';

export function normalizeField(field: string): string {
  return field
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function hasKnownValue(value: unknown): boolean {
  if (value == null) return false;
  const token = String(value).trim().toLowerCase();
  return !UNKNOWN_VALUES.has(token);
}

export function humanizeField(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a field value for cell display.
 * Handles JSON array strings (e.g. '["black","white"]') by parsing and joining.
 * Humanizes slug-style tokens (e.g. "dark-gray+black" → "Dark Gray+Black").
 */
export function formatCellValue(value: unknown): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw || raw === '[]') return '';
  // Detect JSON array string
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return '';
        return parsed
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
          .map((token) => token.replace(/(?:^|(?<=[-+ ]))([a-z])/g, (_, c) => c.toUpperCase()))
          .join(', ');
      }
    } catch { /* not valid JSON, fall through */ }
  }
  return raw;
}
