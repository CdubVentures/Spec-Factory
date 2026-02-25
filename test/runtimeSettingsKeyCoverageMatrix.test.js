import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime PUT keys are fully represented in IndexingPage collect payload and run-start payload', async () => {
  const settingsContractPath = path.resolve('src/api/services/settingsContract.js');
  const indexingPagePath = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
  const settingsContractModule = await import(pathToFileURL(settingsContractPath).href);
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const indexingText = readText(indexingPagePath);

  const putFeKeys = new Set([
    ...Object.keys(routePut.stringEnumMap || {}),
    ...Object.keys(routePut.stringFreeMap || {}),
    ...Object.keys(routePut.intRangeMap || {}),
    ...Object.keys(routePut.floatRangeMap || {}),
    ...Object.keys(routePut.boolMap || {}),
    String(routePut.dynamicFetchPolicyMapJsonKey || 'dynamicFetchPolicyMapJson'),
  ]);

  const collectStart = indexingText.indexOf('const collectRuntimeSettingsPayload = () => ({');
  const collectEnd = indexingText.indexOf('const runtimeSettingsPayload = collectRuntimeSettingsPayload();');
  const collectPayloadSection = (
    collectStart >= 0
    && collectEnd > collectStart
  ) ? indexingText.slice(collectStart, collectEnd) : '';
  assert.equal(
    collectPayloadSection.length > 0,
    true,
    'IndexingPage should expose collectRuntimeSettingsPayload section',
  );

  const runControlStart = indexingText.indexOf('const runControlPayload = useMemo(() => {');
  const runControlEnd = indexingText.indexOf('const startIndexLabMut = useMutation', runControlStart);
  const runControlSection = (
    runControlStart >= 0
    && runControlEnd > runControlStart
  ) ? indexingText.slice(runControlStart, runControlEnd) : '';
  assert.equal(runControlSection.length > 0, true, 'IndexingPage should define runControlPayload');

  const startPayloadStart = indexingText.indexOf("return api.post<ProcessStatus>('/process/start', {");
  const startPayloadEnd = indexingText.indexOf('...runControlPayload', startPayloadStart);
  const startPayloadSection = (
    startPayloadStart >= 0
    && startPayloadEnd > startPayloadStart
  ) ? indexingText.slice(startPayloadStart, startPayloadEnd) : '';
  assert.equal(startPayloadSection.length > 0, true, 'IndexingPage should define /process/start payload');

  const missingFromCollect = Array.from(putFeKeys).filter((key) => !hasObjectKey(collectPayloadSection, key));
  assert.deepEqual(
    missingFromCollect,
    [],
    `every runtime PUT key should be serialized by collectRuntimeSettingsPayload (missing: ${missingFromCollect.join(', ')})`,
  );

  const missingFromStart = Array.from(putFeKeys).filter(
    (key) => {
      const startAliasMap = {
        llmFallbackPlanModel: 'llmPlanFallbackModel',
        llmFallbackExtractModel: 'llmExtractFallbackModel',
        llmFallbackValidateModel: 'llmValidateFallbackModel',
        llmFallbackWriteModel: 'llmWriteFallbackModel',
      };
      const startKey = startAliasMap[key] || key;
      return !hasObjectKey(startPayloadSection, startKey) && !hasObjectKey(runControlSection, key);
    },
  );
  assert.deepEqual(
    missingFromStart,
    [],
    `every runtime PUT key should reach /process/start payload directly or through runControlPayload (missing: ${missingFromStart.join(', ')})`,
  );
});
  const hasObjectKey = (section, key) => {
    if (section.includes(`${key}:`)) return true;
    const shorthandLinePattern = new RegExp(`^\\s*${key}\\s*(,|$)`, 'm');
    return shorthandLinePattern.test(section);
  };
