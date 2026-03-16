import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNTIME_SETTINGS_ROUTE_GET as settingsRuntimeGet,
  RUNTIME_SETTINGS_ROUTE_PUT as settingsRuntimePut,
  RUNTIME_SETTINGS_VALUE_TYPES as settingsRuntimeValueTypes,
} from '../src/features/settings-authority/settingsContract.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET as routeModuleRuntimeGet,
  RUNTIME_SETTINGS_ROUTE_PUT as routeModuleRuntimePut,
  RUNTIME_SETTINGS_VALUE_TYPES as routeModuleRuntimeValueTypes,
} from '../src/features/settings-authority/runtimeSettingsRouteContract.js';

test('settings contract runtime route exports are sourced from the runtime route contract module', () => {
  assert.equal(settingsRuntimeGet, routeModuleRuntimeGet);
  assert.equal(settingsRuntimePut, routeModuleRuntimePut);
  assert.equal(settingsRuntimeValueTypes, routeModuleRuntimeValueTypes);
});
