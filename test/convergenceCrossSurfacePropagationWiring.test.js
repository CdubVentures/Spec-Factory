import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('convergence ownership keeps Pipeline as the only writer surface', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelinePageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    indexingPageText.includes('useConvergenceSettingsAuthority'),
    false,
    'Indexing page should not instantiate convergence writer authority',
  );

  assert.match(
    pipelinePageText,
    /import\s*\{\s*CONVERGENCE_KNOB_GROUPS,[\s\S]*parseConvergenceNumericInput,[\s\S]*readConvergenceKnobValue,[\s\S]*useConvergenceSettingsAuthority[\s\S]*\}\s*from '\.\.\/\.\.\/stores\/convergenceSettingsAuthority';/,
    'Pipeline settings should consume convergence knob metadata/value resolver helpers from the convergence authority module',
  );
  assert.equal(
    pipelinePageText.includes("from '../../stores/settingsManifest'"),
    false,
    'Pipeline settings should not bypass convergence authority by importing knob metadata directly from settings manifest',
  );
  assert.match(
    pipelinePageText,
    /CONVERGENCE_KNOB_GROUPS\.map[\s\S]*updateSetting\(knob\.key, v\)/,
    'Pipeline settings should iterate knob metadata and write by canonical knob key',
  );

  assert.equal(
    indexingPageText.includes("import { RuntimePanel } from './panels/RuntimePanel';"),
    false,
    'Indexing page should not import runtime settings container',
  );
  assert.equal(
    indexingPageText.includes('<RuntimePanel'),
    false,
    'Indexing page should not render runtime settings container',
  );
  assert.equal(
    indexingPageText.includes('/convergence-settings'),
    false,
    'Indexing page should not directly call convergence settings route',
  );
  assert.equal(
    pipelinePageText.includes('/convergence-settings'),
    false,
    'Pipeline settings page should not directly call convergence settings route',
  );
});
