import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings local rows initialize from authority bootstrap cache', () => {
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    llmSettingsPageText.includes('useLlmSettingsBootstrapRows'),
    true,
    'LlmSettingsPage should import llm bootstrap selector hook from authority',
  );
  assert.equal(
    llmSettingsPageText.includes('const llmSettingsBootstrapRows = useLlmSettingsBootstrapRows(category);'),
    true,
    'LlmSettingsPage should define llm bootstrap rows from authority selector hook',
  );
  assert.equal(
    llmSettingsPageText.includes('readLlmSettingsBootstrapRows(queryClient, category)'),
    false,
    'LlmSettingsPage should not manually read llm bootstrap rows via local queryClient calls',
  );
  assert.equal(
    llmSettingsPageText.includes('useQueryClient()'),
    false,
    'LlmSettingsPage should not directly instantiate query client just for bootstrap reads',
  );
  assert.equal(
    llmSettingsPageText.includes("queryClient.getQueryData<{ rows?: LlmRouteRow[] }>(['llm-settings-routes', category])"),
    false,
    'LlmSettingsPage should not read llm settings cache key directly',
  );
  assert.equal(
    llmSettingsPageText.includes('const [rows, setRows] = useState<LlmRouteRow[]>(() => llmSettingsBootstrapRows);'),
    true,
    'LLM rows local state should initialize from authority bootstrap rows',
  );
  assert.equal(
    llmSettingsPageText.includes('() => Object.fromEntries(llmSettingsBootstrapRows.map((row) => [row.route_key, row]))'),
    true,
    'LLM default rows baseline should initialize from authority bootstrap rows',
  );
  assert.equal(
    llmSettingsPageText.includes('setRows(llmSettingsBootstrapRows);'),
    true,
    'Category transitions should reseed rows from authority bootstrap rows',
  );
  assert.equal(
    llmSettingsPageText.includes('const [rows, setRows] = useState<LlmRouteRow[]>([]);'),
    false,
    'LLM rows local state should no longer initialize from hardcoded empty array',
  );
});
