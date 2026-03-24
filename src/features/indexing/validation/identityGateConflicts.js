import { normalizeToken } from '../../../utils/common.js';
import {
  tokenize,
  unique,
  firstFieldValue,
  firstFieldValueMatching,
} from './identityGatePrimitives.js';

export const DIMENSION_FIELD_BOUNDS = Object.freeze({
  lngth: Object.freeze({ min: 50, max: 220 }),
  width: Object.freeze({ min: 30, max: 120 }),
  height: Object.freeze({ min: 10, max: 100 }),
});

export const GENERIC_SENSOR_TOKENS = new Set([
  'capable',
  'capability',
  'dpi',
  'esport',
  'esports',
  'first',
  'flawless',
  'gaming',
  'gen',
  'gen2',
  'generation',
  'laser',
  'mouse',
  'optical',
  'performance',
  'perfect',
  'polling',
  'position',
  'rate',
  'rates',
  'second',
  'sensor',
  'source',
  'supporting',
  'supports',
  'supported',
  'third',
  'ultra',
  'wireless',
  'wired',
]);

export const SENSOR_ORDINAL_TOKEN_MAP = Object.freeze({
  first: '1',
  '1st': '1',
  second: '2',
  '2nd': '2',
  third: '3',
  '3rd': '3',
  gen2: '2',
  gen3: '3',
});

export function normalizeSensorFamilyTokens(value) {
  const tokens = tokenize(value)
    .map((token) => SENSOR_ORDINAL_TOKEN_MAP[token] || token)
    .filter((token) => token && !GENERIC_SENSOR_TOKENS.has(token));
  return unique(tokens);
}

export function hasStructuredSensorModelToken(token) {
  return /[a-z]/.test(token) && /\d/.test(token) && token.length >= 4;
}

export function isPlausibleDimensionValue(field, value) {
  const bounds = DIMENSION_FIELD_BOUNDS[field];
  if (!bounds) {
    return false;
  }
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return parsed >= bounds.min && parsed <= bounds.max;
}

export function isSpecificSensorValue(value) {
  const familyTokens = normalizeSensorFamilyTokens(value);
  if (familyTokens.length === 0) {
    return false;
  }
  if (familyTokens.some(hasStructuredSensorModelToken)) {
    return true;
  }
  return familyTokens.filter((token) => token.length >= 3 || /\d/.test(token)).length >= 2;
}

export function dimensionConflict(values) {
  const nums = values
    .map((v) => Number.parseFloat(String(v)))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 2) {
    return false;
  }
  // Use median-based outlier filtering: discard values more than 20mm from the
  // median before checking spread.  Review/comparison tables often embed specs
  // for OTHER products alongside the target, producing plausible-but-wrong
  // dimension values that should not trigger an identity conflict.
  // Core spread threshold is 15mm because different measurement methods
  // (button height vs scroll-wheel height, with/without cable overhang)
  // can differ by 10-14mm for the SAME product.  The identity gate should
  // only flag genuinely different product classes (compact vs full-size).
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  const core = nums.filter((n) => Math.abs(n - median) <= 20);
  if (core.length < 2) {
    return false;
  }
  return Math.max(...core) - Math.min(...core) > 15;
}

export function shouldSuppressHeightOnlyDimensionConflict({
  lengthValues = [],
  widthValues = [],
  lengthConflict = false,
  widthConflict = false,
  heightConflict = false,
}) {
  if (!heightConflict || lengthConflict || widthConflict) {
    return false;
  }
  // Height is noisier than length/width in review pages because grip height
  // callouts and weight-adjacent values can look like plausible dimensions.
  // If length and width already have multi-source consensus, do not let a
  // height-only spread flip the identity gate into conflict.
  return (
    lengthValues.length >= 2 &&
    widthValues.length >= 2 &&
    !dimensionConflict(lengthValues) &&
    !dimensionConflict(widthValues)
  );
}

export function connectionClassesCompatible(values) {
  const classes = [...values].map((v) => {
    const token = String(v).toLowerCase();
    const hasWireless = token.includes('wireless');
    const hasWired = token.includes('wired') || token.includes('usb');
    if (hasWireless && hasWired) return 'dual';
    if (hasWireless) return 'wireless';
    if (hasWired) return 'wired';
    return 'unk';
  }).filter((c) => c !== 'unk');
  if (classes.length < 2) return true;
  const unique = [...new Set(classes)];
  if (unique.length === 1) return true;
  if (unique.includes('dual')) {
    const nonDual = unique.filter((c) => c !== 'dual');
    return nonDual.every((c) => c === 'wireless' || c === 'wired');
  }
  return false;
}

export function sensorTokenOverlap(values) {
  const tokenSets = [...values].map((v) => normalizeSensorFamilyTokens(v));
  if (tokenSets.length < 2) return true;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      if (a.length === 0 || b.length === 0) {
        continue;
      }
      if (a.every((token) => b.includes(token)) || b.every((token) => a.includes(token))) {
        continue;
      }
      const allTokens = new Set([...a, ...b]);
      if (allTokens.size === 0) continue;
      const overlap = a.filter((t) => b.includes(t)).length;
      const minLen = Math.min(a.length, b.length);
      if (minLen > 0 && overlap / minLen < 0.75) return false;
    }
  }
  return true;
}

export function skuTokenOverlap(values) {
  const tokenSets = [...values].map((v) => {
    const segments = String(v).split(/[-_\s]+/).filter(Boolean);
    return segments.map((s) => s.toLowerCase());
  });
  if (tokenSets.length < 2) return true;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      const overlap = a.filter((t) => b.includes(t)).length;
      if (overlap === 0) return false;
    }
  }
  return true;
}

export function buildIdentityCriticalContradictions(sources) {
  const contradictions = [];
  const accepted = sources.filter((s) => s.identity?.match && !s.discoveryOnly);

  const connectionValues = new Set(
    accepted
      .map((s) => firstFieldValue(s, 'connection'))
      .filter(Boolean)
      .map((v) => normalizeToken(v))
  );
  if (connectionValues.size > 1 && !connectionClassesCompatible(connectionValues)) {
    contradictions.push({ source: 'aggregate', conflict: 'connection_class_conflict' });
  }

  // Sensor naming is too ambiguous for identity gating — marketing names
  // (e.g. "Focus Pro 36K") and chip codes (e.g. "PAW3950") have zero token
  // overlap but refer to the same component.  Sensor conflicts are resolved
  // during field consensus, not during identity validation.

  const skuValues = new Set(
    accepted
      .map((s) => s.identityCandidates?.sku)
      .filter(Boolean)
      .map((v) => normalizeToken(v))
  );
  if (skuValues.size > 1 && !skuTokenOverlap(skuValues)) {
    contradictions.push({ source: 'aggregate', conflict: 'sku_conflict' });
  }

  const lengthValues = accepted
    .map((s) => firstFieldValueMatching(s, 'lngth', (value) => isPlausibleDimensionValue('lngth', value)))
    .filter(Boolean);
  const widthValues = accepted
    .map((s) => firstFieldValueMatching(s, 'width', (value) => isPlausibleDimensionValue('width', value)))
    .filter(Boolean);
  const heightValues = accepted
    .map((s) => firstFieldValueMatching(s, 'height', (value) => isPlausibleDimensionValue('height', value)))
    .filter(Boolean);
  const _dimConflictL = dimensionConflict(lengthValues);
  const _dimConflictW = dimensionConflict(widthValues);
  const _dimConflictH = dimensionConflict(heightValues);
  const _suppressHeightOnlyConflict = shouldSuppressHeightOnlyDimensionConflict({
    lengthValues,
    widthValues,
    lengthConflict: _dimConflictL,
    widthConflict: _dimConflictW,
    heightConflict: _dimConflictH,
  });
  if (_dimConflictL || _dimConflictW || (_dimConflictH && !_suppressHeightOnlyConflict)) {
    contradictions.push({ source: 'aggregate', conflict: 'size_class_conflict' });
  }

  return contradictions;
}
