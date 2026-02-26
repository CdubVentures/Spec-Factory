import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_STRATEGY_AUTHORITY = path.resolve('tools/gui-react/src/stores/sourceStrategyAuthority.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('source strategy authority is category-scoped end-to-end', () => {
  const sourceAuthorityText = readText(SOURCE_STRATEGY_AUTHORITY);
  const settingsAuthorityText = readText(SETTINGS_AUTHORITY);
  const pipelineSettingsPageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    sourceAuthorityText.includes('category: string;'),
    true,
    'source strategy authority options should require category',
  );
  assert.equal(
    sourceAuthorityText.includes('enabled?: boolean;'),
    true,
    'source strategy authority options should support enabled guard for all-scope disablement',
  );
  assert.equal(
    sourceAuthorityText.includes("['source-strategy', category]"),
    true,
    'source strategy query key should be category-scoped',
  );
  assert.equal(
    sourceAuthorityText.includes('const categoryQuery = `?category=${encodeURIComponent(category)}`;'),
    true,
    'source strategy authority should build encoded category query param',
  );
  assert.equal(
    sourceAuthorityText.includes('enabled: enabled && autoQueryEnabled,'),
    true,
    'source strategy query should respect enabled guard',
  );
  assert.equal(
    sourceAuthorityText.includes('/source-strategy${categoryQuery}'),
    true,
    'source strategy reads should include category query param',
  );
  assert.equal(
    sourceAuthorityText.includes('/source-strategy/${row.id}${categoryQuery}'),
    true,
    'source strategy updates should include category query param',
  );
  assert.equal(
    sourceAuthorityText.includes('/source-strategy/${id}${categoryQuery}'),
    true,
    'source strategy deletes should include category query param',
  );

  assert.equal(
    /useSourceStrategyReader\(\{\s*category,\s*enabled:\s*category !== 'all'/.test(settingsAuthorityText),
    true,
    'settings bootstrap should pass active category and all-scope enable guard to source strategy reader authority',
  );
  assert.equal(
    pipelineSettingsPageText.includes('const category = useUiStore((s) => s.category);'),
    true,
    'pipeline settings page should read active category from ui store',
  );
  assert.equal(
    /useSourceStrategyAuthority\(\{\s*category,/.test(pipelineSettingsPageText),
    true,
    'pipeline settings page should pass active category into source strategy authority',
  );
  assert.equal(
    pipelineSettingsPageText.includes('enabled: !isAll,'),
    true,
    'pipeline settings page should disable source strategy authority while category scope is all',
  );
  assert.equal(
    pipelineSettingsPageText.includes('Select a specific category to manage source strategy rows.'),
    true,
    'pipeline settings page should display explicit category-required state for source strategy in all scope',
  );
});
