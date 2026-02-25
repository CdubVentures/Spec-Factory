import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings autosave flushes pending dirty payload on unmount', () => {
  const authorityText = readText(LLM_SETTINGS_AUTHORITY);

  assert.match(
    authorityText,
    /useEffect\(\(\) => \(\) => \{[\s\S]*autoSaveEnabled[\s\S]*dirty[\s\S]*saveMutate\(\{ rows, version: editVersion \}\)/,
    'LLM settings authority should flush pending dirty autosave payload on unmount',
  );
});
