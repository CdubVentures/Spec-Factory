import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('indexing run start wiring performs optimistic run-id switch and keeps runs polling hot', () => {
  const source = readText(INDEXING_PAGE);

  assert.equal(
    source.includes('function buildRequestedRunId'),
    true,
    'IndexingPage should build a requested run id before process start',
  );
  assert.equal(
    source.includes('requestedRunId: String(requestedRunId || \'\').trim(),'),
    true,
    'IndexingPage should send requestedRunId in /process/start payload',
  );
  assert.equal(
    source.includes('setSelectedIndexLabRunId(optimisticRunId);'),
    true,
    'IndexingPage should switch canonical selected run id during onMutate for immediate UI flip',
  );
  assert.equal(
    source.includes('onRunIndexLab={handleRunIndexLab}'),
    true,
    'PickerPanel should use a run-start handler that injects requestedRunId',
  );
  assert.equal(
    source.includes('requestedRunId: buildRequestedRunId()'),
    true,
    'Run-start handler should generate requestedRunId per click',
  );
  assert.equal(
    source.includes('refetchInterval: getRefetchInterval(isProcessRunning, false)'),
    true,
    'IndexLab runs polling should stay active while process is running regardless of picker collapse',
  );
  assert.equal(
    source.includes("queryClient.invalidateQueries({ queryKey: ['runtime-ops'] })"),
    true,
    'Run-start and refresh should invalidate runtime-ops query namespace for cross-tab sync',
  );
});
