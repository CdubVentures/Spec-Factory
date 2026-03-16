// WHY: Pure normalizer functions needed by config.js at assembly time.
// Extracted from features/indexing/extraction to fix dependency inversion
// (core must not import from features).

function policyToInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function policyToBoolOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(token)) {
    return false;
  }
  return null;
}

export function normalizeArticleHostToken(host) {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

export function normalizeArticleExtractorMode(value, fallback = 'auto') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (!token) return fallback;
  if (token === 'auto') return 'auto';
  if (token === 'prefer_readability' || token === 'readability' || token === 'readability_preferred') {
    return 'prefer_readability';
  }
  if (token === 'prefer_fallback' || token === 'fallback' || token === 'heuristic') {
    return 'prefer_fallback';
  }
  return fallback;
}

export function normalizeArticleExtractorPolicyMap(input = {}) {
  const output = {};
  if (!input || typeof input !== 'object') {
    return output;
  }

  for (const [rawHost, rawPolicy] of Object.entries(input)) {
    const host = normalizeArticleHostToken(rawHost);
    if (!host || !rawPolicy || typeof rawPolicy !== 'object') {
      continue;
    }
    output[host] = {
      mode: normalizeArticleExtractorMode(rawPolicy.mode || rawPolicy.preference || 'auto', 'auto'),
      enabled: policyToBoolOrNull(rawPolicy.enabled),
      minChars: policyToInt(rawPolicy.minChars ?? rawPolicy.min_chars, 0),
      minScore: policyToInt(rawPolicy.minScore ?? rawPolicy.min_score, 0),
      maxChars: policyToInt(rawPolicy.maxChars ?? rawPolicy.max_chars, 0)
    };
  }
  return output;
}
