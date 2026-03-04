import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime autosave payload fallbacks are authority-derived after hydration', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes('const [runtimeSettingsFallbackBaseline, setRuntimeSettingsFallbackBaseline] = useState('),
    true,
    'IndexingPage should keep a runtime autosave fallback baseline that can be updated from hydrated authority settings',
  );
  assert.equal(
    indexingPageText.includes('readRuntimeSettingsNumericBaseline'),
    true,
    'IndexingPage should derive runtime autosave numeric baselines through shared runtime authority helpers',
  );
  assert.equal(
    indexingPageText.includes('runtimeSettingsNumericBaselineEqual'),
    true,
    'IndexingPage should compare runtime numeric baseline snapshots through shared runtime authority helpers',
  );
  assert.equal(
    indexingPageText.includes('function runtimeSettingsBaselineEqual'),
    false,
    'IndexingPage should not keep local runtime baseline equality helpers once authority helpers are available',
  );

  const collectStart = indexingPageText.indexOf('const collectRuntimeSettingsPayload = () => collectRuntimeSettingsPayloadFromDomain({');
  const collectEnd = indexingPageText.indexOf('const runtimeSettingsPayload = collectRuntimeSettingsPayload();');
  assert.notEqual(collectStart, -1, 'collectRuntimeSettingsPayload block should exist');
  assert.notEqual(collectEnd, -1, 'runtimeSettingsPayload initialization marker should exist');
  const collectText = indexingPageText.slice(collectStart, collectEnd);

  assert.equal(
    collectText.includes('runtimeSettingsFallbackBaseline'),
    true,
    'runtime autosave payload should pass shared runtime baseline contract into serializer',
  );
  assert.equal(
    collectText.includes('resolveModelTokenDefaults'),
    true,
    'runtime autosave payload should pass shared model token resolver into serializer',
  );
  assert.equal(
    collectText.includes('collectRuntimeSettingsPayloadFromDomain'),
    true,
    'runtime autosave payload should serialize through shared runtime domain serializer',
  );
  assert.equal(
    collectText.includes('runtimeDefaults.fetchConcurrency'),
    false,
    'runtime autosave payload should not fallback to hardcoded runtime defaults once baseline is available',
  );

  assert.equal(
    indexingPageText.includes('setRuntimeSettingsFallbackBaseline((previous) => ('),
    true,
    'runtime autosave fallback baseline should synchronize from hydrated runtime baseline',
  );
});
