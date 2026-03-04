import { normalizeToken } from '../utils/common.js';

function tokenize(value) {
  return normalizeToken(value)
    .split(' ')
    .filter(Boolean);
}

function includesAllTokens(haystack, needles) {
  return needles.every((token) => haystack.includes(token));
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

const DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG = Object.freeze({
  identityGateBaseMatchThreshold: 0.8,
  identityGateThresholdFloor: 0.62,
  identityGateThresholdCeiling: 0.92,
  identityGateEasyAmbiguityReduction: -0.15,
  identityGateMediumAmbiguityReduction: -0.10,
  identityGateHardAmbiguityReduction: -0.02,
  identityGateVeryHardAmbiguityIncrease: 0.01,
  identityGateExtraHardAmbiguityIncrease: 0.03,
  identityGateMissingStrongIdPenalty: -0.05,
  identityGateHardMissingStrongIdIncrease: 0.03,
  identityGateVeryHardMissingStrongIdIncrease: 0.05,
  identityGateExtraHardMissingStrongIdIncrease: 0.08,
  identityGateNumericTokenBoost: 0.1,
  identityGateNumericRangeThreshold: 3,
});

function toFiniteNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIdentityGateDynamicThresholdConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const thresholdFloor = Math.max(
    0,
    Math.min(
      1,
      toFiniteNumber(source.identityGateThresholdFloor, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateThresholdFloor)
    )
  );
  const thresholdCeiling = Math.max(
    thresholdFloor,
    Math.min(
      1,
      toFiniteNumber(source.identityGateThresholdCeiling, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateThresholdCeiling)
    )
  );
  return {
    identityGateBaseMatchThreshold: toFiniteNumber(source.identityGateBaseMatchThreshold, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateBaseMatchThreshold),
    identityGateThresholdFloor: thresholdFloor,
    identityGateThresholdCeiling: thresholdCeiling,
    identityGateEasyAmbiguityReduction: toFiniteNumber(source.identityGateEasyAmbiguityReduction, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateEasyAmbiguityReduction),
    identityGateMediumAmbiguityReduction: toFiniteNumber(source.identityGateMediumAmbiguityReduction, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateMediumAmbiguityReduction),
    identityGateHardAmbiguityReduction: toFiniteNumber(source.identityGateHardAmbiguityReduction, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateHardAmbiguityReduction),
    identityGateVeryHardAmbiguityIncrease: toFiniteNumber(source.identityGateVeryHardAmbiguityIncrease, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateVeryHardAmbiguityIncrease),
    identityGateExtraHardAmbiguityIncrease: toFiniteNumber(source.identityGateExtraHardAmbiguityIncrease, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateExtraHardAmbiguityIncrease),
    identityGateMissingStrongIdPenalty: toFiniteNumber(source.identityGateMissingStrongIdPenalty, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateMissingStrongIdPenalty),
    identityGateHardMissingStrongIdIncrease: toFiniteNumber(source.identityGateHardMissingStrongIdIncrease, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateHardMissingStrongIdIncrease),
    identityGateVeryHardMissingStrongIdIncrease: toFiniteNumber(source.identityGateVeryHardMissingStrongIdIncrease, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateVeryHardMissingStrongIdIncrease),
    identityGateExtraHardMissingStrongIdIncrease: toFiniteNumber(source.identityGateExtraHardMissingStrongIdIncrease, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateExtraHardMissingStrongIdIncrease),
    identityGateNumericTokenBoost: toFiniteNumber(source.identityGateNumericTokenBoost, DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateNumericTokenBoost),
    identityGateNumericRangeThreshold: Math.max(
      0,
      Math.round(
        toFiniteNumber(
          source.identityGateNumericRangeThreshold,
          DEFAULT_IDENTITY_GATE_DYNAMIC_THRESHOLD_CONFIG.identityGateNumericRangeThreshold
        )
      )
    ),
  };
}

function dynamicMatchThreshold(identityLock = {}, thresholdConfig = null) {
  const cfg = normalizeIdentityGateDynamicThresholdConfig(thresholdConfig || {});
  const hasVariant = str(identityLock.variant) !== '';
  const hasStrongId = str(identityLock.sku) !== '' || str(identityLock.mpn) !== '' || str(identityLock.gtin) !== '';
  const familyModelCount = Math.max(0, Number.parseInt(String(identityLock.family_model_count || 0), 10) || 0);
  const ambiguityToken = String(identityLock.ambiguity_level || '').trim().toLowerCase();
  const ambiguityLevel = ambiguityToken === 'easy' || ambiguityToken === 'low'
    ? 'easy'
    : ambiguityToken === 'medium' || ambiguityToken === 'mid'
      ? 'medium'
      : ambiguityToken === 'hard' || ambiguityToken === 'high'
        ? 'hard'
        : ambiguityToken === 'very_hard' || ambiguityToken === 'very-hard' || ambiguityToken === 'very hard'
          ? 'very_hard'
          : ambiguityToken === 'extra_hard' || ambiguityToken === 'extra-hard' || ambiguityToken === 'extra hard'
            ? 'extra_hard'
            : familyModelCount >= 9
              ? 'extra_hard'
              : familyModelCount >= 6
                ? 'very_hard'
                : familyModelCount >= 4
                  ? 'hard'
                  : familyModelCount >= 2
                    ? 'medium'
                    : familyModelCount === 1
                      ? 'easy'
                      : 'unknown';
  let threshold = cfg.identityGateBaseMatchThreshold;
  if (!hasVariant) {
    if (ambiguityLevel === 'easy') {
      threshold += cfg.identityGateEasyAmbiguityReduction;
    } else if (ambiguityLevel === 'medium') {
      threshold += cfg.identityGateMediumAmbiguityReduction;
    } else if (ambiguityLevel === 'hard') {
      threshold += cfg.identityGateHardAmbiguityReduction;
    } else if (ambiguityLevel === 'very_hard') {
      threshold += cfg.identityGateVeryHardAmbiguityIncrease;
    } else if (ambiguityLevel === 'extra_hard') {
      threshold += cfg.identityGateExtraHardAmbiguityIncrease;
    } else {
      threshold += cfg.identityGateMediumAmbiguityReduction;
    }
  }
  if (!hasStrongId) {
    threshold += cfg.identityGateMissingStrongIdPenalty;
  }
  if (ambiguityLevel === 'hard') {
    threshold += cfg.identityGateHardMissingStrongIdIncrease;
  } else if (ambiguityLevel === 'very_hard') {
    threshold += cfg.identityGateVeryHardMissingStrongIdIncrease;
  } else if (ambiguityLevel === 'extra_hard') {
    threshold += cfg.identityGateExtraHardMissingStrongIdIncrease;
  }
  return Math.max(cfg.identityGateThresholdFloor, Math.min(cfg.identityGateThresholdCeiling, threshold));
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

function firstFieldValue(source, field) {
  const hit = (source.fieldCandidates || []).find((row) => row.field === field && row.value !== 'unk');
  return hit?.value || null;
}

function dimensionConflict(values) {
  const nums = values
    .map((v) => Number.parseFloat(String(v)))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 2) {
    return false;
  }
  return Math.max(...nums) - Math.min(...nums) > 3;
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
  const tokenSets = [...values].map((v) => tokenize(v));
  if (tokenSets.length < 2) return true;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      const allTokens = new Set([...a, ...b]);
      if (allTokens.size === 0) continue;
      const overlap = a.filter((t) => b.includes(t)).length;
      const maxLen = Math.max(a.length, b.length);
      if (maxLen > 0 && overlap / maxLen < 0.6) return false;
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

  const sensorValues = new Set(
    accepted
      .map((s) => firstFieldValue(s, 'sensor'))
      .filter(Boolean)
      .map((v) => normalizeToken(v))
  );
  if (sensorValues.size > 1 && !sensorTokenOverlap(sensorValues)) {
    contradictions.push({ source: 'aggregate', conflict: 'sensor_family_conflict' });
  }

  const skuValues = new Set(
    accepted
      .map((s) => s.identityCandidates?.sku)
      .filter(Boolean)
      .map((v) => normalizeToken(v))
  );
  if (skuValues.size > 1 && !skuTokenOverlap(skuValues)) {
    contradictions.push({ source: 'aggregate', conflict: 'sku_conflict' });
  }

  const lengthValues = accepted.map((s) => firstFieldValue(s, 'lngth')).filter(Boolean);
  const widthValues = accepted.map((s) => firstFieldValue(s, 'width')).filter(Boolean);
  const heightValues = accepted.map((s) => firstFieldValue(s, 'height')).filter(Boolean);
  if (
    dimensionConflict(lengthValues) ||
    dimensionConflict(widthValues) ||
    dimensionConflict(heightValues)
  ) {
    contradictions.push({ source: 'aggregate', conflict: 'size_class_conflict' });
  }

  return contradictions;
}

export function evaluateSourceIdentity(source, identityLock = {}, thresholdConfig = null) {
  const thresholdCfg = normalizeIdentityGateDynamicThresholdConfig(thresholdConfig || {});
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
  const sourceTokenSet = buildSourceTokenSet(source, candidate);

  if (expectedBrand) {
    const brandTokens = tokenize(expectedBrand);
    if (includesAllTokens(candidateBrandToken, brandTokens) || includesAllTokens(candidateModelToken, brandTokens)) {
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
    const candidateModelOverlap = tokenOverlapScore(modelTokens, candidateModelToken, thresholdCfg.identityGateNumericTokenBoost);
    const titleOverlap = tokenOverlapScore(modelTokens, titleToken, thresholdCfg.identityGateNumericTokenBoost);
    const urlOverlap = tokenOverlapScore(modelTokens, urlToken, thresholdCfg.identityGateNumericTokenBoost);
    const bestModelOverlap = Math.max(candidateModelOverlap, titleOverlap, urlOverlap);
    const modelNumericDelta = minNumericDelta(expectedModel, [
      candidate.model,
      source.title,
      source.url
    ]);
    const numericRangeThreshold = Math.max(0, Number.parseInt(String(thresholdCfg.identityGateNumericRangeThreshold ?? 3), 10) || 3);
    const numericRangeOutOfRange = modelNumericDelta !== null && modelNumericDelta > numericRangeThreshold;

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
    if (numericRangeOutOfRange) {
      reasonCodes.push('model_numeric_range_out_of_range');
      score = Math.max(0, score - 0.1);
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
  const matchThreshold = dynamicMatchThreshold(identityLock, thresholdCfg);
  const matchedRequiredTokens = requiredTokens.filter((token) => sourceTokenSet.has(token));
  const missingRequiredTokens = requiredTokens.filter((token) => !sourceTokenSet.has(token));
  const matchedNegativeTokens = negativeTokens.filter((token) => sourceTokenSet.has(token));
  if (matchedNegativeTokens.length > 0) {
    reasonCodes.push('negative_token_present');
    criticalConflicts.push('negative_token_present');
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
    String(s.url || '').startsWith('helper_files://')
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

  const validated = hasManufacturer && hasAdditional && noContradictions && noMajorAnchorConflicts;
  const reasonCodes = [];
  if (!hasManufacturer) {
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
      hasTrustedHelper,
      additionalCredibleSources: credibleAdditionalDomains.size,
      noContradictions,
      noMajorAnchorConflicts
    },
    contradictions,
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
    summary: {
      page_count: pages.length,
      confirmed_count: decisionCounts.CONFIRMED || 0,
      warning_count: decisionCounts.WARNING || 0,
      quarantine_count: decisionCounts.QUARANTINE || 0,
      rejected_count: decisionCounts.REJECTED || 0
    }
  };
}
