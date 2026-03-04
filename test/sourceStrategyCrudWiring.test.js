import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_STRATEGY_AUTHORITY = path.resolve('tools/gui-react/src/stores/sourceStrategyAuthority.ts');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('source strategy authority exposes create and update operations', () => {
  const sourceAuthorityText = readText(SOURCE_STRATEGY_AUTHORITY);

  assert.equal(
    sourceAuthorityText.includes('createRow: (payload: Partial<SourceStrategyRow>) => void;'),
    true,
    'source strategy authority should expose createRow api',
  );
  assert.equal(
    sourceAuthorityText.includes('updateRow: (id: number, payload: Partial<SourceStrategyRow>) => void;'),
    true,
    'source strategy authority should expose updateRow api',
  );
  assert.equal(
    sourceAuthorityText.includes("api.post<"),
    true,
    'source strategy authority should post new source-strategy rows',
  );
  assert.equal(
    sourceAuthorityText.includes('`/source-strategy${categoryQuery}`'),
    true,
    'source strategy create route should include category scope',
  );
});

test('pipeline settings source strategy section exposes CRUD controls', () => {
  const pipelineSettingsPageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    pipelineSettingsPageText.includes('Add Source'),
    true,
    'pipeline settings should expose add source control',
  );
  assert.equal(
    pipelineSettingsPageText.includes('Edit'),
    true,
    'pipeline settings should expose edit source row control',
  );
  assert.equal(
    pipelineSettingsPageText.includes('saveRowDraft'),
    true,
    'pipeline settings should wire source strategy row edits to save handler',
  );
});
