import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_OPS_PAGE = path.resolve('tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime ops run selector is bound to shared indexlab picker run id authority', () => {
  const source = readText(RUNTIME_OPS_PAGE);

  assert.equal(
    source.includes('useIndexLabStore'),
    true,
    'RuntimeOpsPage should consume shared run selector authority from indexlab store',
  );
  assert.equal(
    source.includes('pickerRunId'),
    true,
    'RuntimeOpsPage should read pickerRunId from indexlab authority store',
  );
  assert.equal(
    source.includes('setPickerRunId'),
    true,
    'RuntimeOpsPage should write run selection through indexlab authority store',
  );
  assert.equal(
    source.includes('runtimeOps:run:'),
    false,
    'RuntimeOpsPage should not own an independent runtimeOps:run session key',
  );
  assert.equal(
    source.includes('const effectiveRunId = selectedRunId || processStatusRunId || runs[0]?.run_id || \'\';'),
    true,
    'RuntimeOpsPage should derive effective run id from shared authority with process-status fallback',
  );
});
