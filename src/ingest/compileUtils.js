import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey } from '../shared/primitives.js';
import { toInt as asInt } from '../shared/valueNormalizers.js';

export { isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey, asInt };

export const DEFAULT_REQUIRED_FIELDS = new Set([
  'weight',
  'lngth',
  'width',
  'height',
  'connection',
  'connectivity',
  'polling_rate',
  'dpi',
  'sensor',
  'sensor_brand',
  'switch',
  'switch_brand',
  'side_buttons',
  'middle_buttons'
]);
export const DEFAULT_IDENTITY_FIELDS = new Set([
  'brand',
  'model',
  'variant',
  'base_model',
  'sku',
  'mpn',
  'gtin',
  'category'
]);
export const INSTRUMENTED_HARD_FIELDS = new Set([
  'click_latency',
  'click_latency_list',
  'sensor_latency',
  'sensor_latency_list',
  'shift_latency',
  'click_force'
]);

export function asNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

export function parseSerialDate(value) {
  const token = normalizeText(value);
  if (!/^\d{5}$/.test(token)) {
    return null;
  }
  const parsed = Number(token);
  if (!Number.isFinite(parsed) || parsed < 10000 || parsed > 60000) {
    return null;
  }
  return parsed;
}

export function serialDateToIso(value) {
  const serial = asInt(value, -1);
  if (serial < 0) {
    return '';
  }
  // Spreadsheet 1900 date system (with leap-year offset) maps from 1899-12-30.
  const utcMs = Date.UTC(1899, 11, 30) + (serial * 24 * 60 * 60 * 1000);
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

export function isDateLikeFieldKey(fieldKey = '') {
  return /date|year|release|launch/i.test(normalizeFieldKey(fieldKey));
}

export const COMPONENT_PROPERTY_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'url',
  'range',
  'mixed_number_range',
]);

export function isComponentPropertyType(type) {
  return COMPONENT_PROPERTY_TYPES.has(normalizeToken(type));
}

export function isNumericContractType(type) {
  const token = normalizeToken(type);
  return token === 'number' || token === 'integer' || token === 'range' || token === 'mixed_number_range';
}

export function normalizeSourceMode(value = '') {
  return normalizeToken(value || 'sheet') === 'scratch' ? 'scratch' : 'sheet';
}

export const REVIEW_REQUIRED_LEVELS = new Set(['mandatory', 'non_mandatory']);
export const REVIEW_AVAILABILITY_LEVELS = new Set(['always', 'sometimes', 'rare']);
export const REVIEW_DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'very_hard']);
export const DEFAULT_REVIEW_PRIORITY = Object.freeze({
  required_level: 'non_mandatory',
  availability: 'sometimes',
  difficulty: 'medium'
});

export function normalizeReviewPriority(value = {}) {
  const priority = isObject(value) ? value : {};
  const requiredLevel = normalizeToken(priority.required_level || DEFAULT_REVIEW_PRIORITY.required_level);
  const availability = normalizeToken(priority.availability || DEFAULT_REVIEW_PRIORITY.availability);
  const difficulty = normalizeToken(priority.difficulty || DEFAULT_REVIEW_PRIORITY.difficulty);
  return {
    required_level: REVIEW_REQUIRED_LEVELS.has(requiredLevel) ? requiredLevel : DEFAULT_REVIEW_PRIORITY.required_level,
    availability: REVIEW_AVAILABILITY_LEVELS.has(availability) ? availability : DEFAULT_REVIEW_PRIORITY.availability,
    difficulty: REVIEW_DIFFICULTY_LEVELS.has(difficulty) ? difficulty : DEFAULT_REVIEW_PRIORITY.difficulty
  };
}

export function normalizeReviewAiAssist(value = {}) {
  const aiAssist = isObject(value) ? value : {};
  return {
    reasoning_note: normalizeText(aiAssist.reasoning_note || '')
  };
}

export function titleFromKey(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(' ');
}

export function stableSortStrings(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function orderedUniqueStrings(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const token = normalizeText(value);
    if (!token) {
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(token);
  }
  return out;
}

export function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (!isObject(value)) {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = sortDeep(value[key]);
  }
  return out;
}

export function stableStringify(value) {
  return JSON.stringify(sortDeep(value), null, 2);
}

export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashJson(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseRange(value) {
  const match = String(value || '').trim().match(/^([A-Za-z]+)(\d+)\s*:\s*([A-Za-z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  const startColumn = String(match[1]).toUpperCase();
  const startRow = asInt(match[2], 0);
  const endColumn = String(match[3]).toUpperCase();
  const endRow = asInt(match[4], 0);
  if (startRow <= 0 || endRow <= 0) {
    return null;
  }
  return {
    startColumn,
    startRow,
    endColumn,
    endRow
  };
}

export function parseSourceRangeRef(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const noAbs = text.replace(/\$/g, '');
  const match = noAbs.match(/^'?([^']+)'?!([A-Za-z]+)(\d+)\s*:\s*([A-Za-z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  const sheet = normalizeText(match[1]);
  const startColumn = String(match[2]).toUpperCase();
  const startRow = asInt(match[3], 0);
  const endColumn = String(match[4]).toUpperCase();
  const endRow = asInt(match[5], 0);
  if (!sheet || startRow <= 0 || endRow <= 0) {
    return null;
  }
  return {
    sheet,
    startColumn,
    startRow,
    endColumn,
    endRow
  };
}

export function colToIndex(column) {
  const text = String(column || '').trim().toUpperCase();
  if (!text) {
    return null;
  }
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) {
      return null;
    }
    total = (total * 26) + (code - 64);
  }
  return total > 0 ? total : null;
}

export function indexToCol(index) {
  let value = asInt(index, 0);
  if (value <= 0) {
    return '';
  }
  let out = '';
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

export function splitCellRef(ref) {
  const match = String(ref || '').trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    column: String(match[1]).toUpperCase(),
    row: asInt(match[2], 0)
  };
}
