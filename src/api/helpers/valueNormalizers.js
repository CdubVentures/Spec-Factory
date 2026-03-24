// WHY: Re-export from shared/ — canonical home is src/shared/valueNormalizers.js.
// This shim exists so api-internal consumers keep working without path changes.
export {
  toInt,
  toFloat,
  toUnitRatio,
  hasKnownValue,
  normalizeModelToken,
  parseCsvTokens,
  normalizePathToken,
  normalizeJsonText,
  normalizeDomainToken,
  domainFromUrl,
  urlPathToken,
  parseTsMs,
  percentileFromSorted,
  clampScore,
  incrementMapCounter,
  countMapValuesAbove,
  UNKNOWN_VALUE_TOKENS,
  addTokensFromText,
} from '../../shared/valueNormalizers.js';
