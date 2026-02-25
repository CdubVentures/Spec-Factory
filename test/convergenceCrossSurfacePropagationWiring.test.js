import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('convergence duplicate surfaces are wired to a shared authority and key contract', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const runtimePanelText = readText(RUNTIME_PANEL);
  const pipelinePageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    indexingPageText.includes('useConvergenceSettingsAuthority'),
    true,
    'Indexing page should use convergence settings authority',
  );
  assert.match(
    indexingPageText,
    /<RuntimePanel[\s\S]*convergenceKnobGroups=\{CONVERGENCE_KNOB_GROUPS\}[\s\S]*convergenceSettings=\{convergenceSettings\}[\s\S]*onConvergenceKnobUpdate=\{updateConvergenceKnob\}/,
    'Runtime panel should receive convergence knob metadata, shared state, and shared update handler from authority state',
  );

  assert.match(
    pipelinePageText,
    /import\s*\{\s*CONVERGENCE_KNOB_GROUPS,\s*CONVERGENCE_SETTING_DEFAULTS,\s*useConvergenceSettingsAuthority\s*\}\s*from '\.\.\/\.\.\/stores\/convergenceSettingsAuthority';/,
    'Pipeline settings should consume convergence knob metadata and defaults from the convergence authority module',
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

  assert.match(
    runtimePanelText,
    /convergenceKnobGroups\.map[\s\S]*convergenceSettings\[knob\.key\][\s\S]*onConvergenceKnobUpdate\(knob\.key,/,
    'Runtime panel should render and update convergence knobs by canonical knob key from shared metadata',
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
