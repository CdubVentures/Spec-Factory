export const CONVERGENCE_SETTINGS_ROUTE_PUT = Object.freeze({
  intKeys: Object.freeze([
    'serpTriageMinScore',
    'serpTriageMaxUrls',
    'retrievalMaxHitsPerField',
    'retrievalMaxPrimeSources',
  ]),
  floatKeys: Object.freeze([
    'consensusLlmWeightTier1',
    'consensusLlmWeightTier2',
    'consensusLlmWeightTier3',
    'consensusLlmWeightTier4',
    'consensusTier1Weight',
    'consensusTier2Weight',
    'consensusTier3Weight',
    'consensusTier4Weight',
    'consensusTier4OverrideThreshold',
    'consensusMinConfidence',
  ]),
  boolKeys: Object.freeze([
    'retrievalIdentityFilterEnabled',
  ]),
});

const convergenceValueTypeMap = {};
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys) {
  convergenceValueTypeMap[key] = 'integer';
}
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys) {
  convergenceValueTypeMap[key] = 'number';
}
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys) {
  convergenceValueTypeMap[key] = 'boolean';
}

export const CONVERGENCE_SETTINGS_VALUE_TYPES = Object.freeze(convergenceValueTypeMap);
