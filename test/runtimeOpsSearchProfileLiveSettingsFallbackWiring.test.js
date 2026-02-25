import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_PROFILE_PANEL = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchProfilePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('search profile planner badge falls back to artifact state when live runtime settings are unavailable', () => {
  const panelText = readText(SEARCH_PROFILE_PANEL);

  assert.equal(
    panelText.includes('const llmPlannerActive = liveSettings?.phase2LlmEnabled ?? llmPlannerFromArtifact;'),
    true,
    'Search profile panel should fallback to artifact planner status when live settings are undefined',
  );
  assert.equal(
    panelText.includes('const llmPlannerActive = liveSettings ? liveSettings.phase2LlmEnabled : llmPlannerFromArtifact;'),
    false,
    'Search profile panel should not force undefined live settings into an OFF planner state',
  );
});
