import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime run payload fallbacks are authority-derived after hydration', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes('const runtimeSettingsBaseline = useMemo('),
    true,
    'IndexingPage should define a runtime settings baseline derived from hydrated authority data',
  );
  assert.equal(
    indexingPageText.includes('readRuntimeSettingsNumericBaseline(runtimeSettingsData, runtimeSettingsFallbackBaseline)'),
    true,
    'runtime settings baseline should derive through shared authority numeric-baseline helper',
  );

  const runControlStart = indexingPageText.indexOf('const runControlPayload = useMemo(() => {');
  const runControlEnd = indexingPageText.indexOf('const startIndexLabMut = useMutation');
  assert.notEqual(runControlStart, -1, 'runControlPayload block should exist');
  assert.notEqual(runControlEnd, -1, 'startIndexLabMut block should exist');
  const runControlText = indexingPageText.slice(runControlStart, runControlEnd);

  assert.equal(
    runControlText.includes('runtimeSettingsBaseline.resumeWindowHours'),
    true,
    'runControlPayload should fallback to runtime baseline resume window hours',
  );
  assert.equal(
    runControlText.includes('runtimeSettingsBaseline.reextractAfterHours'),
    true,
    'runControlPayload should fallback to runtime baseline reextract-after hours',
  );
  assert.equal(
    runControlText.includes('runtimeDefaults.resumeWindowHours'),
    false,
    'runControlPayload should not fallback to hardcoded runtime defaults once baseline is available',
  );

  const startMutEnd = indexingPageText.indexOf('const stopMut = useMutation');
  assert.notEqual(startMutEnd, -1, 'stop mutation block marker should exist');
  const startMutText = indexingPageText.slice(runControlEnd, startMutEnd);

  assert.equal(
    startMutText.includes('runtimeSettingsBaseline.fetchConcurrency'),
    true,
    'run start mutation should fallback to runtime baseline fetch concurrency',
  );
  assert.equal(
    startMutText.includes('runtimeSettingsBaseline.perHostMinDelayMs'),
    true,
    'run start mutation should fallback to runtime baseline per-host delay',
  );
  assert.equal(
    startMutText.includes('runtimeSettingsBaseline.scannedPdfOcrMinConfidence'),
    true,
    'run start mutation should fallback to runtime baseline OCR confidence',
  );
  assert.equal(
    startMutText.includes('runtimeDefaults.fetchConcurrency'),
    false,
    'run start mutation should not fallback to hardcoded runtime defaults once baseline is available',
  );
});
