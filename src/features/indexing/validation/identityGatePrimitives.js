import { normalizeAlphanumToken } from '../../../shared/primitives.js';

export function tokenize(value) {
  return normalizeAlphanumToken(value)
    .split(' ')
    .filter(Boolean);
}

export const UNEXPECTED_VARIANT_SUFFIX_TOKENS = new Set([
  'air',
  'classic',
  'dex',
  'elite',
  'lite',
  'max',
  'mini',
  'plus',
  'se',
  'signature',
  'ultra',
  'xl',
]);

export function includesAllTokens(haystack, needles) {
  return needles.every((token) => haystack.includes(token));
}

export function findTokenSequenceStart(haystackTokens = [], needleTokens = []) {
  if (!Array.isArray(haystackTokens) || !Array.isArray(needleTokens)) {
    return -1;
  }
  if (needleTokens.length === 0 || haystackTokens.length < needleTokens.length) {
    return -1;
  }
  for (let start = 0; start <= (haystackTokens.length - needleTokens.length); start += 1) {
    let match = true;
    for (let index = 0; index < needleTokens.length; index += 1) {
      if (haystackTokens[start + index] !== needleTokens[index]) {
        match = false;
        break;
      }
    }
    if (match) {
      return start;
    }
  }
  return -1;
}

export function tokenOverlapScore(expectedTokens, candidateText, numericBoostValue = 0.1) {
  const candidateTokens = tokenize(candidateText);
  if (!expectedTokens.length || !candidateTokens.length) {
    return 0;
  }
  const expectedSet = new Set(expectedTokens);
  const matched = expectedTokens.filter((token) => candidateTokens.includes(token));
  const coverage = matched.length / expectedSet.size;

  const expectedNumeric = expectedTokens.filter((token) => /^\d+$/.test(token));
  const matchedNumeric = expectedNumeric.filter((token) => candidateTokens.includes(token));
  const parsedNumericBoost = Number.parseFloat(String(numericBoostValue ?? 0.1));
  const safeNumericBoost = Number.isFinite(parsedNumericBoost)
    ? Math.max(-1, Math.min(1, parsedNumericBoost))
    : 0.1;
  const numericBoost = expectedNumeric.length > 0 && matchedNumeric.length > 0 ? safeNumericBoost : 0;
  return Math.min(1, coverage + numericBoost);
}

export function numericFragments(value) {
  return [...String(value || '').matchAll(/\d+/g)]
    .map((match) => Number.parseInt(String(match[0] || ''), 10))
    .filter((num) => Number.isFinite(num));
}

export function minNumericDelta(expectedValue, candidateValues = []) {
  const expectedNums = numericFragments(expectedValue);
  if (expectedNums.length === 0) {
    return null;
  }
  let minDelta = Infinity;
  for (const value of candidateValues) {
    const candidateNums = numericFragments(value);
    for (const expected of expectedNums) {
      for (const candidate of candidateNums) {
        minDelta = Math.min(minDelta, Math.abs(expected - candidate));
      }
    }
  }
  return Number.isFinite(minDelta) ? minDelta : null;
}

export function hasAllExpectedNumericFragments(expectedValue, candidateValues = []) {
  const expectedNums = [...new Set(numericFragments(expectedValue))];
  if (expectedNums.length === 0) {
    return true;
  }
  const observedNums = new Set();
  for (const value of candidateValues) {
    for (const num of numericFragments(value)) {
      observedNums.add(num);
    }
  }
  return expectedNums.every((num) => observedNums.has(num));
}

export function detectConnectionClass(value) {
  const token = normalizeAlphanumToken(value);
  if (!token) {
    return null;
  }
  if (token.includes('wireless') && token.includes('wired')) {
    return 'dual';
  }
  if (token.includes('wireless')) {
    return 'wireless';
  }
  if (token.includes('wired')) {
    return 'wired';
  }
  return 'unk';
}

export function firstKnownClass(...classes) {
  for (const value of classes) {
    if (value != null && value !== '') {
      return value;
    }
  }
  return null;
}

export function str(value) {
  return String(value || '').trim();
}

export function nonEmptyArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => String(row || '').trim())
    .filter(Boolean);
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function expectedRequiredTokens(identityLock = {}) {
  return unique([
    ...tokenize(identityLock.brand),
    ...tokenize(identityLock.base_model)
  ]);
}

export function expectedNegativeTokens(identityLock = {}) {
  const fromFlat = nonEmptyArray(identityLock.negativeTokens);
  const fromSnake = nonEmptyArray(identityLock.negative_tokens);
  const fromAnchorTokens = nonEmptyArray(identityLock.anchorTokens?.negative);
  const fromAnchorTokensSnake = nonEmptyArray(identityLock.anchor_tokens?.negative);
  return unique([
    ...fromFlat,
    ...fromSnake,
    ...fromAnchorTokens,
    ...fromAnchorTokensSnake
  ].map((token) => normalizeAlphanumToken(token)));
}

export function detectUnexpectedVariantTokens({
  expectedModel = '',
  expectedVariant = '',
  candidateVariant = '',
  candidateModel = '',
  sourceTitle = '',
  sourceUrl = '',
} = {}) {
  if (str(expectedVariant)) {
    return [];
  }
  const modelTokens = tokenize(expectedModel);
  if (modelTokens.length === 0) {
    return [];
  }

  const unexpected = [];
  const candidateVariantTokens = tokenize(candidateVariant);
  for (const token of candidateVariantTokens) {
    if (UNEXPECTED_VARIANT_SUFFIX_TOKENS.has(token)) {
      unexpected.push(token);
    }
  }

  const collectUnexpectedTailTokens = (value) => {
    const tokens = tokenize(value);
    const start = findTokenSequenceStart(tokens, modelTokens);
    if (start < 0) {
      return;
    }
    for (const token of tokens.slice(start + modelTokens.length)) {
      if (UNEXPECTED_VARIANT_SUFFIX_TOKENS.has(token)) {
        unexpected.push(token);
      }
    }
  };

  collectUnexpectedTailTokens(candidateModel);
  collectUnexpectedTailTokens(sourceUrl);
  return unique(unexpected);
}

export function buildSourceTokenSet(source, candidate) {
  const tokens = tokenize([
    source?.title || '',
    source?.url || '',
    source?.finalUrl || '',
    candidate?.brand || '',
    candidate?.model || '',
    candidate?.variant || '',
    candidate?.sku || '',
    candidate?.mpn || '',
    candidate?.gtin || '',
    source?.connectionHint || ''
  ].join(' '));
  return new Set(tokens);
}

export function scoreDecisionBand(score) {
  if (score >= 0.85) {
    return 'CONFIRMED';
  }
  if (score >= 0.6) {
    return 'WARNING';
  }
  if (score >= 0.4) {
    return 'QUARANTINE';
  }
  return 'REJECTED';
}

export function gateStatusFromIdentityResult(identityResult = {}) {
  if (identityResult.match) {
    return 'CONFIRMED';
  }
  if ((identityResult.criticalConflicts || []).length > 0) {
    return 'REJECTED';
  }
  return scoreDecisionBand(identityResult.score || 0);
}

export function firstFieldValue(source, field) {
  const hit = (source.fieldCandidates || []).find((row) => row.field === field && row.value != null);
  return hit?.value || null;
}

export function firstFieldValueMatching(source, field, isValidValue = () => true) {
  const rows = Array.isArray(source?.fieldCandidates) ? source.fieldCandidates : [];
  for (const row of rows) {
    if (row?.field !== field) {
      continue;
    }
    const value = row?.normalized_value ?? row?.value_normalized ?? row?.value;
    if (value === null || value === undefined) {
      continue;
    }
    const token = String(value).trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (!isValidValue(value, row)) {
      continue;
    }
    return value;
  }
  return null;
}
