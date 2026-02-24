import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');
const LLM_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings routes are owned by a shared authority module', () => {
  assert.equal(fs.existsSync(LLM_SETTINGS_AUTHORITY), true, 'llm settings authority module should exist');

  const authorityText = readText(LLM_SETTINGS_AUTHORITY);
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);

  assert.equal(authorityText.includes('/llm-settings/'), true, 'llm settings authority should own llm settings route usage');
  assert.equal(llmSettingsPageText.includes('useLlmSettingsAuthority'), true, 'LLM settings page should use llm settings authority');
  assert.equal(llmSettingsPageText.includes('/llm-settings/'), false, 'LLM settings page should not directly own llm settings route usage');
});
