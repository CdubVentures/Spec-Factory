import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings status distinguishes autosave-pending unsaved state', () => {
  const llmSettingsText = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    llmSettingsText.includes("autoSaveEnabled ? 'Unsaved (Auto-Save Pending).' : 'Unsaved changes.'"),
    true,
    'LLM settings dirty status should explicitly show autosave-pending state when autosave is enabled',
  );
  assert.equal(
    llmSettingsText.includes("if (!dirty) return;"),
    false,
    'LLM settings should not clear save error/partial state to idle just because edits remain dirty',
  );
  assert.match(
    llmSettingsText,
    /saveStatus\.kind === 'error'[\s\S]*saveStatus\.kind === 'partial'[\s\S]*dirty[\s\S]*'Unsaved \(Auto-Save Pending\)\.'/,
    'LLM settings status precedence should keep error/partial messaging ahead of generic unsaved labels',
  );
});
