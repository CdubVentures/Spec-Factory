export const CONVERGENCE_SETTINGS_ROUTE_PUT = Object.freeze({
  intKeys: Object.freeze([
    'serpTriageMinScore',
    'serpTriageMaxUrls',
  ]),
  floatKeys: Object.freeze([]),
  boolKeys: Object.freeze([]),
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
