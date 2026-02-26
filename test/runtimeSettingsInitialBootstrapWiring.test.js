import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings local state initializes from authority bootstrap cache, not direct runtime defaults', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes('useRuntimeSettingsBootstrap'),
    true,
    'IndexingPage should import runtime settings bootstrap selector hook from authority',
  );
  assert.equal(
    indexingPageText.includes('const runtimeSettingsBootstrap = useRuntimeSettingsBootstrap(RUNTIME_SETTING_DEFAULTS);'),
    true,
    'IndexingPage bootstrap should read runtime authority snapshot via shared selector hook',
  );
  assert.equal(
    indexingPageText.includes('readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS)'),
    false,
    'IndexingPage should not manually read runtime bootstrap via local queryClient calls',
  );
  assert.equal(
    indexingPageText.includes('const [profile, setProfile] = useState<RuntimeProfile>(runtimeSettingsBootstrap.profile);'),
    true,
    'runtime profile local state should initialize from authority bootstrap using shared runtime profile type',
  );
  assert.equal(
    indexingPageText.includes("const [fetchConcurrency, setFetchConcurrency] = useState(String(runtimeSettingsBootstrap.fetchConcurrency));"),
    true,
    'runtime numeric local state should initialize from authority bootstrap',
  );
  assert.equal(
    indexingPageText.includes('const [dynamicCrawleeEnabled, setDynamicCrawleeEnabled] = useState(runtimeSettingsBootstrap.dynamicCrawleeEnabled);'),
    true,
    'runtime boolean local state should initialize from authority bootstrap',
  );
  assert.equal(
    indexingPageText.includes("queryClient.getQueryData<Record<string, unknown>>(['runtime-settings'])"),
    false,
    'IndexingPage should not read runtime settings cache key directly',
  );
  assert.equal(
    indexingPageText.includes('runtimeDefaults.profile'),
    false,
    'runtime profile local state should no longer initialize directly from local runtimeDefaults aliases',
  );
  assert.equal(
    indexingPageText.includes('runtimeDefaults.fetchConcurrency'),
    false,
    'runtime numeric local state should no longer initialize directly from local runtimeDefaults aliases',
  );
});
