export function makeAcceptedSource(overrides = {}) {
  return {
    url: overrides.url || 'https://example.com/product',
    rootDomain: overrides.rootDomain || 'example.com',
    host: overrides.host || 'example.com',
    tier: overrides.tier || 2,
    role: overrides.role || 'lab',
    approvedDomain: true,
    discoveryOnly: false,
    helperSource: overrides.helperSource || false,
    identity: {
      match: true,
      score: 0.76,
      reasons: ['brand_match', 'model_match'],
      criticalConflicts: [],
      ...(overrides.identity || {})
    },
    anchorCheck: { majorConflicts: [] },
    fieldCandidates: overrides.fieldCandidates || [],
    identityCandidates: overrides.identityCandidates || {},
    ...(overrides.extra || {})
  };
}
