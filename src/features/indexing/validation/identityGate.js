import { normalizeToken } from '../../../utils/common.js';

function tokenize(value) {
  return normalizeToken(value)
    .split(' ')
    .filter(Boolean);
}

const UNEXPECTED_VARIANT_SUFFIX_TOKENS = new Set([
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

function includesAllTokens(haystack, needles) {
  return needles.every((token) => haystack.includes(token));
}

function findTokenSequenceStart(haystackTokens = [], needleTokens = []) {
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

function tokenOverlapScore(expectedTokens, candidateText, numericBoostValue = 0.1) {
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

function numericFragments(value) {
  return [...String(value || '').matchAll(/\d+/g)]
    .map((match) => Number.parseInt(String(match[0] || ''), 10))
    .filter((num) => Number.isFinite(num));
}

function minNumericDelta(expectedValue, candidateValues = []) {
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

function hasAllExpectedNumericFragments(expectedValue, candidateValues = []) {
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

function likelyProductSpecificSource(source) {
  const rawUrl = String(source?.url || '');
  const url = rawUrl.toLowerCase();
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    const categoryHubSignals = [
      '/products/gaming-mice',
      '/products/mice',
      '/shop/c/',
      '/search',
      '/sitemap',
      '/robots.txt'
    ];
    if (categoryHubSignals.some((token) => path.includes(token))) {
      return false;
    }
    if (query.includes('q=') || query.includes('query=')) {
      return false;
    }
  } catch {
    // continue with heuristic fallback
  }

  const title = normalizeToken(source?.title || '');
  const signals = [
    '/product',
    '/products/',
    '/support/',
    '/manual',
    '/spec',
    '/download'
  ];
  if (signals.some((signal) => url.includes(signal))) {
    return true;
  }
  return title.includes('spec') || title.includes('support') || title.includes('manual');
}


function detectConnectionClass(value) {
  const token = normalizeToken(value);
  if (!token) {
    return 'unk';
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

function firstKnownClass(...classes) {
  for (const value of classes) {
    if (value && value !== 'unk') {
      return value;
    }
  }
  return 'unk';
}

function str(value) {
  return String(value || '').trim();
}

function nonEmptyArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => String(row || '').trim())
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function expectedRequiredTokens(identityLock = {}) {
  return unique([
    ...tokenize(identityLock.brand),
    ...tokenize(identityLock.model)
  ]);
}

function expectedNegativeTokens(identityLock = {}) {
  const fromFlat = nonEmptyArray(identityLock.negativeTokens);
  const fromSnake = nonEmptyArray(identityLock.negative_tokens);
  const fromAnchorTokens = nonEmptyArray(identityLock.anchorTokens?.negative);
  const fromAnchorTokensSnake = nonEmptyArray(identityLock.anchor_tokens?.negative);
  return unique([
    ...fromFlat,
    ...fromSnake,
    ...fromAnchorTokens,
    ...fromAnchorTokensSnake
  ].map((token) => normalizeToken(token)));
}

function detectUnexpectedVariantTokens({
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

function buildSourceTokenSet(source, candidate) {
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

function scoreDecisionBand(score) {
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

function gateStatusFromIdentityResult(identityResult = {}) {
  if (identityResult.match) {
    return 'CONFIRMED';
  }
  if ((identityResult.criticalConflicts || []).length > 0) {
    return 'REJECTED';
  }
  return scoreDecisionBand(identityResult.score || 0);
}

function canonicalSourceId(source = {}, index = 0) {
  if (source.source_id) {
    return String(source.source_id);
  }
  if (source.sourceId) {
    return String(source.sourceId);
  }
  if (source.rootDomain) {
    return String(source.rootDomain);
  }
  if (source.host) {
    return String(source.host);
  }
  return `source_${String(index + 1).padStart(3, '0')}`;
}

function roundIdentityNumber(value) {
  const parsed = Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number.parseFloat(parsed.toFixed(6));
}

function summarizeIdentitySource(source = {}, index = 0, extra = {}) {
  const identity = source.identity || {};
  return {
    sourceId: canonicalSourceId(source, index),
    url: source.finalUrl || source.url || '',
    host: String(source.host || '').trim(),
    rootDomain: String(source.rootDomain || '').trim(),
    role: String(source.role || '').trim(),
    tier: Number.parseInt(String(source.tier ?? 0), 10) || 0,
    candidateBrand: String(source.identityCandidates?.brand || '').trim(),
    candidateModel: String(source.identityCandidates?.model || '').trim(),
    identityScore: roundIdentityNumber(identity.score),
    identityConfidence: roundIdentityNumber(identity.confidence ?? identity.score),
    reasonCodes: unique([
      ...(identity.reasonCodes || []),
      ...(identity.criticalConflicts || []),
    ]),
    ...extra,
  };
}

function summarizeIdentitySourceSnake(source = {}, index = 0, extra = {}) {
  const summary = summarizeIdentitySource(source, index);
  return {
    source_id: summary.sourceId,
    url: summary.url,
    host: summary.host,
    root_domain: summary.rootDomain,
    role: summary.role,
    tier: summary.tier,
    candidate_brand: summary.candidateBrand,
    candidate_model: summary.candidateModel,
    identity_score: summary.identityScore,
    identity_confidence: summary.identityConfidence,
    reason_codes: summary.reasonCodes,
    ...extra,
  };
}

function isRejectedSiblingIdentitySource(source = {}) {
  if (source.discoveryOnly) {
    return false;
  }
  const identity = source.identity || {};
  if (identity.match) {
    return false;
  }
  const hasModelSignal = Boolean(
    str(source.identityCandidates?.model)
    || str(source.title)
    || str(source.url),
  );
  if (!hasModelSignal) {
    return false;
  }
  const reasonCodes = new Set(unique([
    ...(identity.reasonCodes || []),
    ...(identity.criticalConflicts || []),
  ]));
  return (
    reasonCodes.has('model_mismatch')
    || reasonCodes.has('negative_token_present')
    || reasonCodes.has('unexpected_variant_token')
    || reasonCodes.has('model_numeric_range_out_of_range')
    || (identity.matchedNegativeTokens || []).length > 0
    || (identity.missingRequiredTokens || []).length > 0
  );
}

function buildAcceptedSourceRows(accepted = [], sourceResults = []) {
  return accepted.map((source) => summarizeIdentitySource(source, sourceResults.indexOf(source)));
}

function buildRejectedSiblingSourceRows(sourceResults = []) {
  return sourceResults
    .filter((source) => isRejectedSiblingIdentitySource(source))
    .map((source, index) => summarizeIdentitySource(source, index));
}

function buildAggregateContradictionContributors(accepted = [], conflict = '') {
  if (conflict === 'connection_class_conflict') {
    return accepted.filter((source) => firstFieldValue(source, 'connection'));
  }
  if (conflict === 'sku_conflict') {
    return accepted.filter((source) => str(source.identityCandidates?.sku));
  }
  if (conflict === 'size_class_conflict') {
    return accepted.filter((source) => (
      firstFieldValueMatching(source, 'lngth', (value) => isPlausibleDimensionValue('lngth', value))
      || firstFieldValueMatching(source, 'width', (value) => isPlausibleDimensionValue('width', value))
      || firstFieldValueMatching(source, 'height', (value) => isPlausibleDimensionValue('height', value))
    ));
  }
  return [];
}

function buildContradictionContributorRows(sourceResults = [], accepted = [], contradiction = {}) {
  if (String(contradiction?.source || '') === 'aggregate') {
    return buildAggregateContradictionContributors(accepted, contradiction?.conflict);
  }
  const targetUrl = String(contradiction?.source || '').trim();
  if (!targetUrl) {
    return [];
  }
  return sourceResults.filter((source) => String(source.finalUrl || source.url || '').trim() === targetUrl);
}

function buildAcceptedConflictContributorRows(sourceResults = [], accepted = [], contradictions = []) {
  const contributorMap = new Map();
  for (const contradiction of contradictions) {
    const conflict = String(contradiction?.conflict || '').trim();
    if (!conflict) continue;
    for (const source of buildContradictionContributorRows(sourceResults, accepted, contradiction)) {
      if (!accepted.includes(source)) continue;
      const url = String(source.finalUrl || source.url || '').trim();
      if (!url) continue;
      if (!contributorMap.has(url)) {
        contributorMap.set(url, {
          source,
          conflicts: new Set(),
        });
      }
      contributorMap.get(url).conflicts.add(conflict);
    }
  }
  return [...contributorMap.values()].map(({ source, conflicts }) => summarizeIdentitySource(
    source,
    sourceResults.indexOf(source),
    { contributingConflicts: [...conflicts].sort() },
  ));
}

function buildFirstConflictTrigger(sourceResults = [], accepted = [], contradictions = []) {
  const first = contradictions[0];
  if (!first) {
    return null;
  }
  const contributors = buildContradictionContributorRows(sourceResults, accepted, first)
    .map((source) => summarizeIdentitySource(source, sourceResults.indexOf(source)));
  return {
    source: String(first.source || '').trim(),
    conflict: String(first.conflict || '').trim(),
    contributors,
  };
}

function firstFieldValue(source, field) {
  const hit = (source.fieldCandidates || []).find((row) => row.field === field && row.value !== 'unk');
  return hit?.value || null;
}

function firstFieldValueMatching(source, field, isValidValue = () => true) {
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
    if (!token || token === 'unk') {
      continue;
    }
    if (!isValidValue(value, row)) {
      continue;
    }
    return value;
  }
  return null;
}

const DIMENSION_FIELD_BOUNDS = Object.freeze({
  lngth: Object.freeze({ min: 50, max: 220 }),
  width: Object.freeze({ min: 30, max: 120 }),
  height: Object.freeze({ min: 10, max: 100 }),
});

const GENERIC_SENSOR_TOKENS = new Set([
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

const SENSOR_ORDINAL_TOKEN_MAP = Object.freeze({
  first: '1',
  '1st': '1',
  second: '2',
  '2nd': '2',
  third: '3',
  '3rd': '3',
  gen2: '2',
  gen3: '3',
});

function normalizeSensorFamilyTokens(value) {
  const tokens = tokenize(value)
    .map((token) => SENSOR_ORDINAL_TOKEN_MAP[token] || token)
    .filter((token) => token && !GENERIC_SENSOR_TOKENS.has(token));
  return unique(tokens);
}

function hasStructuredSensorModelToken(token) {
  return /[a-z]/.test(token) && /\d/.test(token) && token.length >= 4;
}

function isPlausibleDimensionValue(field, value) {
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

function isSpecificSensorValue(value) {
  const familyTokens = normalizeSensorFamilyTokens(value);
  if (familyTokens.length === 0) {
    return false;
  }
  if (familyTokens.some(hasStructuredSensorModelToken)) {
    return true;
  }
  return familyTokens.filter((token) => token.length >= 3 || /\d/.test(token)).length >= 2;
}

function dimensionConflict(values) {
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

function shouldSuppressHeightOnlyDimensionConflict({
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

function connectionClassesCompatible(values) {
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

function sensorTokenOverlap(values) {
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

function skuTokenOverlap(values) {
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
    // TEMPORARY DIAGNOSTIC — remove after identity conflict investigation
    const _dimDetail = {};
    if (_dimConflictL) _dimDetail.lngth = lengthValues.map(Number);
    if (_dimConflictW) _dimDetail.width = widthValues.map(Number);
    if (_dimConflictH && !_suppressHeightOnlyConflict) _dimDetail.height = heightValues.map(Number);
    contradictions.push({ source: 'aggregate', conflict: 'size_class_conflict', _dim_values: _dimDetail });
  }

  return contradictions;
}

export function evaluateSourceIdentity(source, identityLock = {}, thresholdConfig = null) {
  const baseThreshold = (thresholdConfig && typeof thresholdConfig === 'object')
    ? Number(thresholdConfig.identityGateBaseMatchThreshold) || 0.8
    : 0.8;
  const candidate = source.identityCandidates || {};
  const reasons = [];
  const criticalConflicts = [];
  const reasonCodes = [];
  let score = 0;

  const expectedBrand = str(identityLock.brand);
  const expectedModel = str(identityLock.model);
  const expectedVariant = str(identityLock.variant);
  const expectedSku = str(identityLock.sku);
  const expectedMpn = str(identityLock.mpn);
  const expectedGtin = str(identityLock.gtin);

  const candidateBrandToken = normalizeToken(candidate.brand);
  const candidateModelToken = normalizeToken(candidate.model);
  const candidateVariantToken = normalizeToken(candidate.variant || source.connectionHint || '');
  const requiredTokens = expectedRequiredTokens(identityLock);
  const negativeTokens = expectedNegativeTokens(identityLock);
  const unexpectedVariantTokens = detectUnexpectedVariantTokens({
    expectedModel,
    expectedVariant,
    candidateVariant: candidate.variant,
    candidateModel: candidate.model,
    sourceTitle: source.title,
    sourceUrl: source.url,
  });
  const sourceTokenSet = buildSourceTokenSet(source, candidate);

  if (expectedBrand) {
    const brandTokens = tokenize(expectedBrand);
    const titleToken = normalizeToken(source.title || '');
    const urlToken = normalizeToken(source.url || '');
    if (
      includesAllTokens(candidateBrandToken, brandTokens) ||
      includesAllTokens(candidateModelToken, brandTokens) ||
      includesAllTokens(titleToken, brandTokens) ||
      includesAllTokens(urlToken, brandTokens)
    ) {
      score += 0.35;
      reasons.push('brand_match');
      reasonCodes.push('brand_match');
    } else if (candidateBrandToken) {
      criticalConflicts.push('brand_mismatch');
      reasonCodes.push('brand_mismatch');
    }
  } else {
    score += 0.1;
  }

  if (expectedModel) {
    const modelTokens = tokenize(expectedModel);
    const titleToken = normalizeToken(source.title || '');
    const urlToken = normalizeToken(source.url || '');
    const candidateModelOverlap = tokenOverlapScore(modelTokens, candidateModelToken, 0.1);
    const titleOverlap = tokenOverlapScore(modelTokens, titleToken, 0.1);
    const urlOverlap = tokenOverlapScore(modelTokens, urlToken, 0.1);
    const bestModelOverlap = Math.max(candidateModelOverlap, titleOverlap, urlOverlap);
    const modelNumericDelta = minNumericDelta(expectedModel, [
      candidate.model,
      source.title,
      source.url
    ]);
    const hasExpectedModelDigits = hasAllExpectedNumericFragments(expectedModel, [
      candidate.model,
      source.title,
      source.url
    ]);
    const numericRangeThreshold = 3;
    const numericRangeOutOfRange = modelNumericDelta !== null && modelNumericDelta > numericRangeThreshold;
    const missingExpectedModelDigits = !hasExpectedModelDigits;

    if (
      includesAllTokens(candidateModelToken, modelTokens) ||
      includesAllTokens(titleToken, modelTokens) ||
      includesAllTokens(urlToken, modelTokens) ||
      bestModelOverlap >= 0.72 ||
      (
        bestModelOverlap >= 0.55 &&
        modelTokens.some((token) => /^\d+$/.test(token)) &&
        (
          candidateModelToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '') ||
          titleToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '') ||
          urlToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '')
        )
      )
    ) {
      score += 0.35;
      reasons.push('model_match');
      reasonCodes.push('model_match');
    } else if (candidateModelToken && likelyProductSpecificSource(source)) {
      criticalConflicts.push('model_mismatch');
      reasonCodes.push('model_mismatch');
    }
    if (missingExpectedModelDigits || numericRangeOutOfRange) {
      reasonCodes.push('model_numeric_range_out_of_range');
      score = Math.max(0, score - 0.1);
      if (likelyProductSpecificSource(source)) {
        criticalConflicts.push('model_numeric_range_out_of_range');
      }
    }
  } else {
    score += 0.1;
  }

  if (expectedVariant) {
    const expectedClass = detectConnectionClass(expectedVariant);
    const candidateClass = firstKnownClass(
      detectConnectionClass(candidateVariantToken),
      detectConnectionClass(source.connectionHint)
    );

    if (expectedClass === 'unk') {
      if (normalizeToken(expectedVariant) && normalizeToken(expectedVariant) === candidateVariantToken) {
        score += 0.15;
        reasons.push('variant_match');
        reasonCodes.push('variant_match');
      }
    } else if (candidateClass === expectedClass || candidateClass === 'dual') {
      score += 0.15;
      reasons.push('variant_match');
      reasonCodes.push('variant_match');
    } else if (candidateClass !== 'unk') {
      criticalConflicts.push('variant_mismatch');
      reasonCodes.push('variant_mismatch');
    }
  } else {
    score += 0.05;
  }

  const idMatches = [];
  const hardIdMatches = {};
  const hardIdMismatches = [];
  if (expectedSku) {
    if (normalizeToken(expectedSku) === normalizeToken(candidate.sku)) {
      idMatches.push('sku');
      hardIdMatches.sku = expectedSku;
    } else if (candidate.sku) {
      criticalConflicts.push('sku_mismatch');
      hardIdMismatches.push('sku_mismatch');
      reasonCodes.push('sku_mismatch');
    }
  }
  if (expectedMpn) {
    if (normalizeToken(expectedMpn) === normalizeToken(candidate.mpn)) {
      idMatches.push('mpn');
      hardIdMatches.mpn = expectedMpn;
    } else if (candidate.mpn) {
      criticalConflicts.push('mpn_mismatch');
      hardIdMismatches.push('mpn_mismatch');
      reasonCodes.push('mpn_mismatch');
    }
  }
  if (expectedGtin) {
    if (normalizeToken(expectedGtin) === normalizeToken(candidate.gtin)) {
      idMatches.push('gtin');
      hardIdMatches.gtin = expectedGtin;
    } else if (candidate.gtin) {
      criticalConflicts.push('gtin_mismatch');
      hardIdMismatches.push('gtin_mismatch');
      reasonCodes.push('gtin_mismatch');
    }
  }

  if (idMatches.length > 0) {
    score += 0.15;
    reasons.push('hard_id_match');
    reasonCodes.push('hard_id_match');
    for (const id of idMatches) {
      const code = `${id}_match`;
      reasons.push(code);
      reasonCodes.push(code);
    }
  }

  score = Math.max(0, Math.min(1, score));
  const matchThreshold = baseThreshold;
  const matchedRequiredTokens = requiredTokens.filter((token) => sourceTokenSet.has(token));
  const missingRequiredTokens = requiredTokens.filter((token) => !sourceTokenSet.has(token));
  const matchedNegativeTokens = unique([
    ...negativeTokens.filter((token) => sourceTokenSet.has(token)),
    ...unexpectedVariantTokens
  ]);
  if (matchedNegativeTokens.length > 0) {
    reasonCodes.push('negative_token_present');
    criticalConflicts.push('negative_token_present');
  }
  if (unexpectedVariantTokens.length > 0) {
    reasonCodes.push('unexpected_variant_token');
  }
  if (missingRequiredTokens.length > 0 && requiredTokens.length > 0) {
    reasonCodes.push('missing_required_tokens');
  }
  if (hardIdMismatches.length > 0) {
    reasonCodes.push('hard_id_mismatch');
  }

  const hasHardIdMatch = idMatches.length > 0;
  const hasHardIdMismatch = hardIdMismatches.length > 0;
  const hasCriticalConflicts = criticalConflicts.length > 0;
  const match = score >= matchThreshold && !hasCriticalConflicts;

  let decision = scoreDecisionBand(score);
  if (hasHardIdMismatch || matchedNegativeTokens.length > 0) {
    decision = 'REJECTED';
  } else if (hasHardIdMatch) {
    decision = 'CONFIRMED';
  } else if (hasCriticalConflicts) {
    decision = 'REJECTED';
  } else if (match) {
    decision = 'CONFIRMED';
  }

  let confidence = score;
  if (hasHardIdMatch && !hasHardIdMismatch) {
    confidence = 1;
  }
  if (decision === 'REJECTED') {
    confidence = Math.min(confidence, 0.39);
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    match,
    score,
    confidence,
    decision,
    matchThreshold,
    reasons: unique(reasons),
    reasonCodes: unique(reasonCodes),
    criticalConflicts: unique(criticalConflicts),
    matchedHardIds: hardIdMatches,
    matchedRequiredTokens: unique(matchedRequiredTokens),
    missingRequiredTokens: unique(missingRequiredTokens),
    matchedNegativeTokens: unique(matchedNegativeTokens)
  };
}

export function evaluateIdentityGate(sourceResults) {
  const accepted = sourceResults.filter(
    (s) =>
      !s.discoveryOnly &&
      s.identity?.match &&
      (s.anchorCheck?.majorConflicts || []).length === 0 &&
      s.approvedDomain
  );

  const manufacturer = accepted.find(
    (s) => s.role === 'manufacturer' && s.tier === 1 && s.approvedDomain
  );
  const helperAccepted = accepted.filter((s) =>
    s.helperSource ||
    String(s.host || '').toLowerCase() === 'helper-files.local' ||
    String(s.url || '').startsWith('category_authority://')
  );
  const credibleAdditionalDomains = new Set(
    accepted
      .filter((s) => s.tier <= 2 && s.approvedDomain)
      .filter((s) => !manufacturer || s.rootDomain !== manufacturer.rootDomain)
      .map((s) => s.rootDomain)
  );

  const directContradictions = sourceResults
    .filter((s) => !s.discoveryOnly)
    .filter((s) => (s.identity?.criticalConflicts || []).length > 0)
    .filter((s) =>
      (s.identity?.score || 0) >= 0.45 ||
      (s.identity?.reasons || []).includes('model_match') ||
      (
        (s.identity?.reasons || []).includes('brand_match') &&
        (s.identity?.reasons || []).includes('variant_match') &&
        likelyProductSpecificSource(s)
      )
    )
    .flatMap((s) =>
      (s.identity?.criticalConflicts || []).map((conflict) => ({
        source: s.url,
        conflict
      }))
  );
  const crossSourceContradictions = buildIdentityCriticalContradictions(sourceResults);
  const contradictions = [...directContradictions, ...crossSourceContradictions];
  const acceptedExactMatchSources = buildAcceptedSourceRows(accepted, sourceResults);
  const acceptedConflictContributors = buildAcceptedConflictContributorRows(
    sourceResults,
    accepted,
    contradictions,
  );
  const rejectedSiblingSources = buildRejectedSiblingSourceRows(sourceResults);
  const firstConflictTrigger = buildFirstConflictTrigger(sourceResults, accepted, contradictions);

  const majorAnchors = sourceResults.flatMap((s) =>
    (s.anchorCheck?.majorConflicts || []).map((c) => ({
      source: s.url,
      ...c
    }))
  );

  const hasManufacturer = Boolean(manufacturer);
  const hasTrustedHelper = helperAccepted.length > 0;
  const hasAdditional =
    credibleAdditionalDomains.size >= 2 ||
    (hasTrustedHelper && credibleAdditionalDomains.size >= 1);
  const noContradictions = contradictions.length === 0;
  const noMajorAnchorConflicts = majorAnchors.length === 0;

  const labDomains = new Set(
    accepted
      .filter((s) => s.tier === 1 && s.approvedDomain)
      .map((s) => s.rootDomain)
  );
  const hasLabConsensus = labDomains.size >= 2;
  const hasManufacturerOrLabConsensus = hasManufacturer || hasLabConsensus;

  const validated = hasManufacturerOrLabConsensus && hasAdditional && noContradictions && noMajorAnchorConflicts;
  const reasonCodes = [];
  if (!hasManufacturerOrLabConsensus) {
    reasonCodes.push('missing_manufacturer_confirmation');
  }
  if (!hasAdditional) {
    reasonCodes.push('missing_additional_credible_sources');
  }
  if (!noContradictions) {
    reasonCodes.push('identity_conflict');
  }
  if (!noMajorAnchorConflicts) {
    reasonCodes.push('major_anchor_conflict');
  }

  let certainty = 0.4;
  if (hasManufacturer) certainty += 0.25;
  else if (hasLabConsensus) certainty += 0.20;
  if (hasAdditional) certainty += 0.2;
  if (hasTrustedHelper) certainty += 0.05;
  if (noContradictions) certainty += 0.1;
  if (noMajorAnchorConflicts) certainty += 0.1;
  if (accepted.length >= 3) certainty += 0.05;
  certainty = Math.max(0, Math.min(1, certainty));

  if (validated) {
    certainty = Math.max(certainty, 0.95);
  }

  let status = 'CONFIRMED';
  if (!validated) {
    if (!noContradictions || !noMajorAnchorConflicts) {
      status = 'IDENTITY_CONFLICT';
    } else if (accepted.length === 0) {
      status = 'IDENTITY_FAILED';
    } else {
      status = 'LOW_CONFIDENCE';
    }
  }

  let reason = 'OK';
  if (!validated) {
    reason = 'MODEL_AMBIGUITY_ALERT';
    reasonCodes.push('model_ambiguity_alert');
  }

  const needsReview = status !== 'CONFIRMED';
  if (certainty < 0.70) {
    reasonCodes.push('certainty_below_publish_threshold');
  }

  return {
    validated,
    reason,
    status,
    needsReview,
    certainty,
    reasonCodes: unique(reasonCodes),
    requirements: {
      hasManufacturer,
      hasLabConsensus,
      hasTrustedHelper,
      additionalCredibleSources: credibleAdditionalDomains.size,
      noContradictions,
      noMajorAnchorConflicts
    },
    contradictions,
    acceptedExactMatchSources,
    acceptedConflictContributors,
    rejectedSiblingSources,
    firstConflictTrigger,
    majorAnchors,
    manufacturerSource: manufacturer?.url || null,
    acceptedSourceCount: accepted.length
  };
}

export function buildIdentityReport({
  productId,
  runId,
  sourceResults = [],
  identityGate = null
}) {
  const reconciliation = identityGate || evaluateIdentityGate(sourceResults);
  const pages = (sourceResults || [])
    .filter((source) => !source.discoveryOnly)
    .map((source, index) => {
      const identity = source.identity || {};
      const decision = gateStatusFromIdentityResult(identity);
      const reasonCodes = unique([
        ...(identity.reasonCodes || []),
        ...(identity.reasons || []),
        ...(identity.criticalConflicts || []),
        ...(source.anchorCheck?.majorConflicts || []).map(() => 'major_anchor_conflict')
      ]);
      const confidence = Number.parseFloat(String(identity.confidence ?? identity.score ?? 0)) || 0;

      return {
        source_id: canonicalSourceId(source, index),
        url: source.finalUrl || source.url || '',
        decision,
        confidence: Number.parseFloat(confidence.toFixed(6)),
        matched_hard_ids: identity.matchedHardIds || {},
        matched_required_tokens: identity.matchedRequiredTokens || [],
        matched_negative_tokens: identity.matchedNegativeTokens || [],
        reason_codes: reasonCodes
      };
    });

  const decisionCounts = pages.reduce((acc, page) => {
    acc[page.decision] = (acc[page.decision] || 0) + 1;
    return acc;
  }, {});

  return {
    product_id: String(productId || ''),
    run_id: String(runId || ''),
    pages,
    status: reconciliation.status || 'IDENTITY_FAILED',
    needs_review: Boolean(reconciliation.needsReview),
    reason_codes: reconciliation.reasonCodes || [],
    contradiction_count: Array.isArray(reconciliation.contradictions)
      ? reconciliation.contradictions.length
      : 0,
    contradictions: Array.isArray(reconciliation.contradictions)
      ? reconciliation.contradictions.map((row) => ({
          source: String(row?.source || '').trim(),
          conflict: String(row?.conflict || '').trim(),
          ...(row?._dim_values ? { _dim_values: row._dim_values } : {}),
        }))
      : [],
    accepted_exact_match_sources: Array.isArray(reconciliation.acceptedExactMatchSources)
      ? reconciliation.acceptedExactMatchSources.map((row) => summarizeIdentitySourceSnake({}, 0, {
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
        }))
      : [],
    accepted_conflict_contributors: Array.isArray(reconciliation.acceptedConflictContributors)
      ? reconciliation.acceptedConflictContributors.map((row) => ({
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
          contributing_conflicts: Array.isArray(row.contributingConflicts)
            ? row.contributingConflicts
            : [],
        }))
      : [],
    rejected_sibling_sources: Array.isArray(reconciliation.rejectedSiblingSources)
      ? reconciliation.rejectedSiblingSources.map((row) => ({
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
        }))
      : [],
    first_conflict_trigger: reconciliation.firstConflictTrigger
      ? {
          source: String(reconciliation.firstConflictTrigger.source || '').trim(),
          conflict: String(reconciliation.firstConflictTrigger.conflict || '').trim(),
          contributors: Array.isArray(reconciliation.firstConflictTrigger.contributors)
            ? reconciliation.firstConflictTrigger.contributors.map((row) => ({
                source_id: row.sourceId,
                url: row.url,
                host: row.host,
                root_domain: row.rootDomain,
                role: row.role,
                tier: row.tier,
                candidate_brand: row.candidateBrand,
                candidate_model: row.candidateModel,
                identity_score: row.identityScore,
                identity_confidence: row.identityConfidence,
                reason_codes: row.reasonCodes,
              }))
            : [],
        }
      : null,
    summary: {
      page_count: pages.length,
      confirmed_count: decisionCounts.CONFIRMED || 0,
      warning_count: decisionCounts.WARNING || 0,
      quarantine_count: decisionCounts.QUARANTINE || 0,
      rejected_count: decisionCounts.REJECTED || 0
    }
  };
}
