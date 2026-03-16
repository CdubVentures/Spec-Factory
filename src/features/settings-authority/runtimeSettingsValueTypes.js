import { RUNTIME_SETTINGS_ROUTE_PUT } from './runtimeSettingsRoutePut.js';

const runtimeValueTypeMap = {};
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap)) {
  runtimeValueTypeMap[value] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'integer';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'number';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.boolMap)) {
  runtimeValueTypeMap[value] = 'boolean';
}
runtimeValueTypeMap.dynamicFetchPolicyMapJson = 'string';
runtimeValueTypeMap.dynamicFetchPolicyMap = 'object';
runtimeValueTypeMap.awsRegion = 'string';
runtimeValueTypeMap.s3Bucket = 'string';

export const RUNTIME_SETTINGS_VALUE_TYPES = Object.freeze(runtimeValueTypeMap);
