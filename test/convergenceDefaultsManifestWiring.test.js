import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_MANIFEST = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');
const SHARED_DEFAULTS = path.resolve('src/shared/settingsDefaults.js');
const CONVERGENCE_AUTHORITY = path.resolve('tools/gui-react/src/stores/convergenceSettingsAuthority.ts');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('convergence defaults are defined in settings manifest', () => {
  const manifestText = readText(SETTINGS_MANIFEST);
  const sharedDefaultsText = readText(SHARED_DEFAULTS);

  assert.equal(manifestText.includes('CONVERGENCE_SETTING_DEFAULTS'), true, 'settings manifest should define convergence defaults');
  assert.equal(manifestText.includes("import { SETTINGS_DEFAULTS } from '../../../../src/shared/settingsDefaults.js';"), true, 'settings manifest should import shared defaults');
  assert.equal(manifestText.includes('...SETTINGS_DEFAULTS.convergence'), true, 'convergence defaults should be wired from shared defaults manifest');

  assert.equal(sharedDefaultsText.includes('convergenceMaxRounds: 3'), true, 'convergence max rounds default should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('serpTriageEnabled: true'), true, 'convergence serp triage boolean default should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('laneConcurrencyFetch: 4'), true, 'lane concurrency defaults should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('retrievalMaxPrimeSources: 8'), true, 'retrieval defaults should be shared-manifest-owned');
});

test('convergence authority bootstraps and normalizes settings from manifest defaults', () => {
  const authorityText = readText(CONVERGENCE_AUTHORITY);

  assert.equal(authorityText.includes('normalizeConvergenceSettings'), true, 'convergence authority should normalize settings against canonical defaults');
  assert.equal(authorityText.includes('settings: { ...CONVERGENCE_SETTING_DEFAULTS }'), true, 'convergence store should initialize from convergence defaults');
  assert.equal(authorityText.includes('hydrate: (settings) => set({ settings: normalizeConvergenceSettings(settings), dirty: false })'), true, 'convergence hydrate should normalize persisted payloads using defaults');
});

test('pipeline and runtime convergence controls fallback to manifest defaults', () => {
  const pipelineText = readText(PIPELINE_SETTINGS_PAGE);
  const runtimeText = readText(RUNTIME_PANEL);

  assert.equal(pipelineText.includes('CONVERGENCE_SETTING_DEFAULTS'), true, 'pipeline settings should consume convergence defaults');
  assert.equal(pipelineText.includes("const fallback = typeof defaultValue === 'number' ? defaultValue : knob.min;"), true, 'pipeline numeric controls should fallback to convergence defaults');
  assert.equal(pipelineText.includes('checked={Boolean(value)}'), false, 'pipeline boolean controls should not coerce undefined to false when defaults exist');

  assert.equal(runtimeText.includes('CONVERGENCE_SETTING_DEFAULTS'), true, 'runtime panel should consume convergence defaults');
  assert.equal(runtimeText.includes("const fallback = typeof defaultValue === 'number' ? defaultValue : knob.min;"), true, 'runtime numeric controls should fallback to convergence defaults');
  assert.equal(runtimeText.includes('checked={Boolean(convergenceSettings[knob.key])}'), false, 'runtime boolean controls should not coerce undefined to false when defaults exist');
  assert.equal(runtimeText.includes('const fallback = knob.min;'), false, 'runtime numeric controls should not fallback directly to knob minimum');
});
