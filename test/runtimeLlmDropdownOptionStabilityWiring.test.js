import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime llm dropdown options include current selected models to prevent select fallback resets', () => {
  const indexingPagePath = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
  const text = readText(indexingPagePath);

  assert.equal(
    text.includes('const llmModelOptionsWithCurrent = useMemo(() => {'),
    true,
    'IndexingPage should derive a model-option list that includes currently selected models',
  );
  assert.equal(
    text.includes('...llmModelOptions,'),
    true,
    'Derived model-option list should include backend model options',
  );
  assert.equal(
    text.includes('phase2LlmModel'),
    true,
    'Derived model-option list should include current planner model selection',
  );
  assert.equal(
    text.includes('llmFallbackWriteModel'),
    true,
    'Derived model-option list should include current fallback model selections',
  );
  assert.equal(
    text.includes('llmModelOptions={llmModelOptionsWithCurrent}'),
    true,
    'RuntimePanel should consume the stable model-option list',
  );
});
