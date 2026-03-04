import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('indexing removes runtime settings container and keeps pipeline as canonical runtime editor', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsPageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    indexingPageText.includes("import { RuntimePanel } from './panels/RuntimePanel';"),
    false,
    'indexing page should not import runtime settings container',
  );
  assert.equal(
    indexingPageText.includes('<RuntimePanel'),
    false,
    'indexing page should not render runtime settings container',
  );
  assert.equal(
    indexingPageText.includes('Runtime and convergence settings now live in'),
    false,
    'indexing page should not retain migration notice copy for removed runtime settings container',
  );
  assert.equal(
    pipelineSettingsPageText.includes('<RuntimeSettingsFlowCard'),
    true,
    'pipeline settings should remain the runtime settings editing surface',
  );
});
