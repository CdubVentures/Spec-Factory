import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_SETTINGS_FLOW_CARD = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('pipeline settings route has no ad hoc runtime bootstrap component path', () => {
  assert.equal(
    fs.existsSync(RUNTIME_SETTINGS_FLOW_CARD),
    true,
    'RuntimeSettingsFlowCard should exist as the canonical runtime settings editor surface',
  );

  const runtimeFlowCardText = readText(RUNTIME_SETTINGS_FLOW_CARD);
  assert.equal(
    runtimeFlowCardText.includes('readRuntimeSettingsBootstrap('),
    true,
    'RuntimeSettingsFlowCard should bootstrap runtime settings through shared authority helpers',
  );

  const pipelineText = readText(PIPELINE_SETTINGS_PAGE);
  assert.equal(
    pipelineText.includes('readRuntimeSettingsBootstrap'),
    false,
    'PipelineSettingsPage should not locally bootstrap runtime settings outside runtime flow authority surface',
  );
  assert.equal(
    pipelineText.includes('<RuntimeSettingsFlowCard'),
    true,
    'PipelineSettingsPage should render RuntimeSettingsFlowCard as the single runtime editor surface',
  );
});
