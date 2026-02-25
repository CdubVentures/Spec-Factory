import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings hydration gate uses shared readiness snapshot', () => {
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    llmSettingsPageText.includes('useSettingsAuthorityStore'),
    true,
    'LLM settings page should read hydration readiness from shared settings authority snapshot',
  );

  assert.equal(
    llmSettingsPageText.includes('const llmSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.llmSettingsReady);'),
    true,
    'LLM settings page should read llm settings readiness from shared authority snapshot state',
  );

  assert.equal(
    llmSettingsPageText.includes('const llmHydrated = isAll || (llmSettingsReady && !isLoading);'),
    true,
    'LLM settings page should derive hydration state from shared readiness and query loading state',
  );

  assert.equal(
    llmSettingsPageText.includes('if (!llmHydrated && rows.length === 0)'),
    true,
    'LLM settings page should block empty-state render until hydrated settings are available',
  );

  assert.equal(
    llmSettingsPageText.includes('if (isLoading && rows.length === 0)'),
    false,
    'LLM settings page should not rely on page-local loading-only readiness checks',
  );

  assert.equal(
    llmSettingsPageText.includes('disabled={!llmHydrated || !dirty || isSaving}'),
    true,
    'LLM manual save action should remain disabled until hydration is complete',
  );
});
