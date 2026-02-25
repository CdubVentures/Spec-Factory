import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_RESULTS_PANEL = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchResultsPanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('search results domain-cap summary waits for live runtime settings hydration', () => {
  const panelText = readText(SEARCH_RESULTS_PANEL);

  assert.equal(
    panelText.includes('const hasRuntimeSnapshot = Boolean('),
    true,
    'Search results panel should detect whether runtime settings snapshot is hydrated',
  );
  assert.equal(
    panelText.includes("value: 'hydrating'"),
    true,
    'Search results panel should render an explicit hydrating state for domain cap before runtime settings load',
  );
  assert.equal(
    panelText.includes('return resolveDomainCapSummary(liveSettings);'),
    true,
    'Search results panel should derive domain cap summary from hydrated live runtime settings',
  );
  assert.equal(
    panelText.includes('resolveDomainCapSummary(liveSettings || {})'),
    false,
    'Search results panel should not force hardcoded fallback defaults via empty live settings object',
  );
  assert.equal(
    panelText.includes("'runtime settings hydrating'"),
    true,
    'Search results panel should expose hydrating provider label when runtime settings are unavailable',
  );
});
