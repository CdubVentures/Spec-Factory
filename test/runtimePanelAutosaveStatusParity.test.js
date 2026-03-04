import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime panel shows dirty status for both manual-save and autosave modes', () => {
  const runtimePanelText = readText(RUNTIME_PANEL);

  assert.equal(
    runtimePanelText.includes("runtimeAutoSave ? 'Unsaved (Auto-Save Pending)' : 'Unsaved'"),
    true,
    'runtime panel should surface unsaved state for autosave-on and autosave-off modes',
  );
  assert.equal(
    runtimePanelText.includes("runtimeSettingsSaveMessage || 'All Changes Saved.'"),
    true,
    'runtime panel should show explicit clean-state save status text when no unsaved changes remain',
  );
  assert.equal(
    runtimePanelText.includes("convergenceSettingsSaveMessage || 'All Changes Saved.'"),
    true,
    'convergence save status should show explicit clean-state text when no unsaved changes remain',
  );
  assert.equal(
    runtimePanelText.includes("'saving…'"),
    false,
    'runtime panel should avoid non-ascii saving text variants that can render as mojibake',
  );
  assert.equal(
    runtimePanelText.includes('runtimeSettingsDirty && !runtimeAutoSave'),
    false,
    'runtime panel should not hide dirty status while autosave is enabled',
  );
});
