import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKERS_TAB = path.resolve('tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime ops workers tab does not auto-stop runs on prefetch/domain-classifier updates', () => {
  const workersTabText = readText(WORKERS_TAB);

  assert.equal(
    workersTabText.includes('shouldAutoStopOnDomainClassifier'),
    false,
    'WorkersTab should not import the domain-classifier auto-stop helper',
  );
  assert.equal(
    workersTabText.includes('/process/stop'),
    false,
    'WorkersTab should not issue /process/stop automatically',
  );
  assert.equal(
    workersTabText.includes('useMutation'),
    false,
    'WorkersTab should not own a mutation that auto-stops the active process',
  );
});
