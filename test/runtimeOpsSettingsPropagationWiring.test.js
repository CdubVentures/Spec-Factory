import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKERS_TAB = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime ops workers tab consumes runtime settings through authority and propagates live settings to prefetch surfaces', () => {
  const workersTabText = readText(WORKERS_TAB);

  assert.equal(
    workersTabText.includes('useRuntimeSettingsAuthority'),
    true,
    'WorkersTab should consume runtime settings via runtime settings authority',
  );
  assert.equal(
    workersTabText.includes('/runtime-settings'),
    false,
    'WorkersTab should not directly call runtime settings endpoint',
  );
  assert.match(
    workersTabText,
    /useRuntimeSettingsAuthority\(\{[\s\S]*payload: \{\},[\s\S]*dirty: false,[\s\S]*autoSaveEnabled: false,[\s\S]*\}\)/,
    'WorkersTab should read runtime settings in read-only authority mode',
  );

  assert.match(
    workersTabText,
    /const liveSettings = useMemo\(\(\): PrefetchLiveSettings => \(\{[\s\S]*profile:[\s\S]*phase2LlmEnabled:[\s\S]*phase3LlmTriageEnabled:[\s\S]*searchProvider:[\s\S]*discoveryEnabled:[\s\S]*dynamicCrawleeEnabled:[\s\S]*scannedPdfOcrEnabled:[\s\S]*serpTriageMaxUrls:[\s\S]*uberMaxUrlsPerDomain:/,
    'WorkersTab should derive live prefetch settings directly from authority runtime settings',
  );

  assert.equal(
    workersTabText.includes('renderPrefetchPanel(prefetchTab, prefetchData, category, liveSettings)'),
    true,
    'WorkersTab should pass live settings into prefetch panel rendering',
  );
  assert.equal(
    workersTabText.includes('PrefetchSearchProfilePanel data={data?.search_profile ?? emptyProfile} searchPlans={data?.search_plans} persistScope={persistScope} liveSettings={liveSettings}'),
    true,
    'Search profile prefetch surface should receive runtime live settings',
  );
  assert.equal(
    workersTabText.includes('PrefetchSearchPlannerPanel'),
    true,
    'Search planner prefetch surface should exist in workers tab render path',
  );
  assert.equal(
    workersTabText.includes('liveSettings={liveSettings}'),
    true,
    'Prefetch surfaces that consume runtime control settings should receive live settings props',
  );
});
