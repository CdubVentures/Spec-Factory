import {
  normalizeArticleHostToken,
  normalizeArticleExtractorMode,
  normalizeArticleExtractorPolicyMap,
} from '../../../core/config/configNormalizers.js';

export {
  normalizeArticleHostToken,
  normalizeArticleExtractorMode,
  normalizeArticleExtractorPolicyMap,
};

function hostCandidates(host) {
  const normalized = normalizeArticleHostToken(host);
  if (!normalized) return [];
  const tokens = normalized.split('.');
  const candidates = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    candidates.push(tokens.slice(i).join('.'));
  }
  return candidates;
}

export function resolveArticleExtractionPolicy(config = {}, source = {}) {
  const host = normalizeArticleHostToken(source.host || source.url || '');
  const map = config.articleExtractorDomainPolicyMap || {};
  let matchedHost = '';
  let matchedPolicy = null;

  for (const candidate of hostCandidates(host)) {
    if (map[candidate]) {
      matchedHost = candidate;
      matchedPolicy = map[candidate];
      break;
    }
  }

  const policy = {
    host,
    matchedHost,
    overrideApplied: false,
    mode: 'auto',
    enabled: true,
    minChars: Math.max(100, Number(config.articleExtractorMinChars || 700)),
    minScore: Math.max(1, Number(config.articleExtractorMinScore || 45)),
    maxChars: Math.max(1000, Number(config.articleExtractorMaxChars || 24_000))
  };

  if (!matchedPolicy) {
    return policy;
  }

  policy.overrideApplied = true;
  policy.mode = normalizeArticleExtractorMode(matchedPolicy.mode || '', 'auto');
  if (typeof matchedPolicy.enabled === 'boolean') {
    policy.enabled = matchedPolicy.enabled;
  }
  if (Number(matchedPolicy.minChars || 0) > 0) {
    policy.minChars = Math.max(100, Number(matchedPolicy.minChars));
  }
  if (Number(matchedPolicy.minScore || 0) > 0) {
    policy.minScore = Math.max(1, Number(matchedPolicy.minScore));
  }
  if (Number(matchedPolicy.maxChars || 0) > 0) {
    policy.maxChars = Math.max(1000, Number(matchedPolicy.maxChars));
  }
  return policy;
}

