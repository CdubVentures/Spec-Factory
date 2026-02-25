import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('runtime snapshot persistence keys cover runtime PUT cfgKey mappings', async () => {
  const settingsContractPath = path.resolve('src/api/services/settingsContract.js');
  const settingsContractModule = await import(pathToFileURL(settingsContractPath).href);
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};

  const snapshotKeys = Array.isArray(settingsContractModule.RUNTIME_SETTINGS_KEYS)
    ? settingsContractModule.RUNTIME_SETTINGS_KEYS
    : [];
  const snapshotSet = new Set(snapshotKeys);

  const putCfgKeys = new Set([
    ...Object.values(routePut.stringEnumMap || {}).map((entry) => entry.cfgKey),
    ...Object.values(routePut.stringFreeMap || {}),
    ...Object.values(routePut.intRangeMap || {}).map((entry) => entry.cfgKey),
    ...Object.values(routePut.floatRangeMap || {}).map((entry) => entry.cfgKey),
    ...Object.values(routePut.boolMap || {}),
    String(routePut.dynamicFetchPolicyMapJsonKey || 'dynamicFetchPolicyMapJson'),
  ]);

  const missingFromSnapshot = Array.from(putCfgKeys).filter((key) => !snapshotSet.has(key));
  assert.deepEqual(
    missingFromSnapshot,
    [],
    `runtime snapshot key list must include every runtime PUT cfg key (missing: ${missingFromSnapshot.join(', ')})`,
  );

  const allowedSnapshotOnly = new Set(['dynamicFetchPolicyMap']);
  const unexpectedSnapshotOnly = snapshotKeys.filter(
    (key) => !putCfgKeys.has(key) && !allowedSnapshotOnly.has(key),
  );
  assert.deepEqual(
    unexpectedSnapshotOnly,
    [],
    `runtime snapshot keys should not drift from runtime PUT cfg keys (unexpected: ${unexpectedSnapshotOnly.join(', ')})`,
  );
});
