import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNTIME_SETTINGS_KEYS,
  CONVERGENCE_SETTINGS_KEYS,
  UI_SETTINGS_KEYS,
} from '../src/features/settings-authority/settingsKeySets.js';
import { RUNTIME_SETTINGS_VALUE_TYPES } from '../src/features/settings-authority/runtimeSettingsRouteContract.js';
import { CONVERGENCE_SETTINGS_VALUE_TYPES } from '../src/features/settings-authority/convergenceSettingsRouteContract.js';
import { UI_SETTINGS_VALUE_TYPES } from '../src/features/settings-authority/settingsValueTypes.js';

function assertSameKeySet(leftKeys, rightKeys, label) {
  const leftSet = new Set(leftKeys);
  const rightSet = new Set(rightKeys);
  const onlyLeft = Array.from(leftSet).filter((key) => !rightSet.has(key)).sort();
  const onlyRight = Array.from(rightSet).filter((key) => !leftSet.has(key)).sort();
  assert.deepEqual(onlyLeft, [], `${label}: keys missing from right set`);
  assert.deepEqual(onlyRight, [], `${label}: keys missing from left set`);
}

test('runtime key set matches runtime value type map keys exactly', () => {
  assertSameKeySet(RUNTIME_SETTINGS_KEYS, Object.keys(RUNTIME_SETTINGS_VALUE_TYPES), 'runtime');
});

test('convergence key set matches convergence value type map keys exactly', () => {
  assertSameKeySet(CONVERGENCE_SETTINGS_KEYS, Object.keys(CONVERGENCE_SETTINGS_VALUE_TYPES), 'convergence');
});

test('ui key set matches ui value type map keys exactly', () => {
  assertSameKeySet(UI_SETTINGS_KEYS, Object.keys(UI_SETTINGS_VALUE_TYPES), 'ui');
});
