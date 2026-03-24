import { RUNTIME_SETTINGS_ROUTE_PUT } from './runtimeSettingsRoutePut.js';

const runtimeValueTypeMap = {};
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap)) {
  runtimeValueTypeMap[value.configKey] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap)) {
  runtimeValueTypeMap[value] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap)) {
  runtimeValueTypeMap[value.configKey] = 'integer';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap)) {
  runtimeValueTypeMap[value.configKey] = 'number';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.boolMap)) {
  runtimeValueTypeMap[value] = 'boolean';
}
runtimeValueTypeMap.awsRegion = 'string';
runtimeValueTypeMap.s3Bucket = 'string';

export const RUNTIME_SETTINGS_VALUE_TYPES = Object.freeze(runtimeValueTypeMap);
