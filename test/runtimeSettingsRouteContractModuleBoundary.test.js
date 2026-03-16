import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_AUTHORITY_ROOT_KEY as contractCategoryRootKey,
  CATEGORY_AUTHORITY_ENABLED_KEY as contractCategoryEnabledKey,
  INDEXING_CATEGORY_AUTHORITY_ENABLED_KEY as contractIndexingCategoryEnabledKey,
  RUNTIME_SETTINGS_ROUTE_GET as contractRuntimeRouteGet,
  RUNTIME_SETTINGS_ROUTE_PUT as contractRuntimeRoutePut,
  RUNTIME_SETTINGS_VALUE_TYPES as contractRuntimeValueTypes,
} from '../src/features/settings-authority/runtimeSettingsRouteContract.js';
import {
  CATEGORY_AUTHORITY_ROOT_KEY as getCategoryRootKey,
  CATEGORY_AUTHORITY_ENABLED_KEY as getCategoryEnabledKey,
  INDEXING_CATEGORY_AUTHORITY_ENABLED_KEY as getIndexingCategoryEnabledKey,
  RUNTIME_SETTINGS_ROUTE_GET as routeGet,
} from '../src/features/settings-authority/runtimeSettingsRouteGet.js';
import { RUNTIME_SETTINGS_ROUTE_PUT as routePut } from '../src/features/settings-authority/runtimeSettingsRoutePut.js';
import { RUNTIME_SETTINGS_VALUE_TYPES as runtimeValueTypes } from '../src/features/settings-authority/runtimeSettingsValueTypes.js';

test('runtime settings route contract exports are sourced from dedicated route modules', () => {
  assert.equal(contractCategoryRootKey, getCategoryRootKey);
  assert.equal(contractCategoryEnabledKey, getCategoryEnabledKey);
  assert.equal(contractIndexingCategoryEnabledKey, getIndexingCategoryEnabledKey);
  assert.strictEqual(contractRuntimeRouteGet, routeGet);
  assert.strictEqual(contractRuntimeRoutePut, routePut);
  assert.strictEqual(contractRuntimeValueTypes, runtimeValueTypes);
});
