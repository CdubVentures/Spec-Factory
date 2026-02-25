import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_PLANNER_PANEL = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchPlannerPanel.tsx');
const SERP_TRIAGE_PANEL = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSerpTriagePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime ops planner and triage badges guard against undefined live settings booleans', () => {
  const plannerText = readText(SEARCH_PLANNER_PANEL);
  const triageText = readText(SERP_TRIAGE_PANEL);

  assert.equal(
    plannerText.includes('const plannerEnabledLive = liveSettings?.phase2LlmEnabled;'),
    true,
    'Search planner panel should read phase2 planner setting as optional live value',
  );
  assert.equal(
    plannerText.includes('{plannerEnabledLive !== undefined && ('),
    true,
    'Search planner panel should render planner badge only when live planner setting is defined',
  );
  assert.equal(
    plannerText.includes('LLM Planner: {plannerEnabledLive ? \'ON\' : \'OFF\'}'),
    true,
    'Search planner panel should render ON/OFF from guarded live planner value',
  );
  assert.equal(
    plannerText.includes('{liveSettings && ('),
    false,
    'Search planner panel should not treat any liveSettings object as a fully hydrated planner boolean',
  );

  assert.equal(
    triageText.includes('const triageEnabledLive = liveSettings?.phase3LlmTriageEnabled;'),
    true,
    'SERP triage panel should read phase3 triage setting as optional live value',
  );
  assert.equal(
    triageText.includes('{triageEnabledLive !== undefined && ('),
    true,
    'SERP triage panel should render triage badge only when live triage setting is defined',
  );
  assert.equal(
    triageText.includes('LLM Triage: {triageEnabledLive ? \'ON\' : \'OFF\'}'),
    true,
    'SERP triage panel should render ON/OFF from guarded live triage value',
  );
  assert.equal(
    triageText.includes('{liveSettings && ('),
    false,
    'SERP triage panel should not treat any liveSettings object as a fully hydrated triage boolean',
  );
});
