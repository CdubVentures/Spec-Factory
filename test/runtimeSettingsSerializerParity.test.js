import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SETTINGS_CONTRACT = path.resolve('src/api/services/settingsContract.js');
const RUNTIME_SETTINGS_DOMAIN = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const hasObjectKey = (section, key) => {
  if (section.includes(`${key}:`)) return true;
  const shorthandLinePattern = new RegExp(`^\\s*${key}\\s*(,|$)`, 'm');
  return shorthandLinePattern.test(section);
};

test('runtime settings serializer parity: domain serializer covers runtime route PUT key contract', async () => {
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT).href);
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const domainText = readText(RUNTIME_SETTINGS_DOMAIN);

  const putFeKeys = new Set([
    ...Object.keys(routePut.stringEnumMap || {}),
    ...Object.keys(routePut.stringFreeMap || {}),
    ...Object.keys(routePut.intRangeMap || {}),
    ...Object.keys(routePut.floatRangeMap || {}),
    ...Object.keys(routePut.boolMap || {}),
    String(routePut.dynamicFetchPolicyMapJsonKey || 'dynamicFetchPolicyMapJson'),
  ]);

  const serializerStart = domainText.indexOf('export function collectRuntimeSettingsPayload(');
  const serializerEnd = domainText.length;
  const serializerSection = (
    serializerStart >= 0
    && serializerEnd > serializerStart
  ) ? domainText.slice(serializerStart, serializerEnd) : '';
  assert.equal(serializerSection.length > 0, true, 'runtime settings domain should expose serializer section');

  const missing = Array.from(putFeKeys).filter((key) => !hasObjectKey(serializerSection, key));
  assert.deepEqual(
    missing,
    [],
    `runtime domain serializer should cover every runtime PUT key (missing: ${missing.join(', ')})`,
  );

  assert.equal(
    serializerSection.includes('runtimeSettingsFallbackBaseline'),
    true,
    'runtime serializer should include shared numeric fallback baseline contract',
  );
  assert.equal(
    serializerSection.includes('resolveModelTokenDefaults'),
    true,
    'runtime serializer should include shared model token resolver contract',
  );
});
