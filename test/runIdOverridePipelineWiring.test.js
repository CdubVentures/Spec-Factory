import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUN_PRODUCT = path.resolve('src/pipeline/runProduct.js');
const SPEC_CLI = path.resolve('src/cli/spec.js');
const RUN_ORCHESTRATOR = path.resolve('src/pipeline/runOrchestrator.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('run pipeline supports runId override wiring from CLI into runProduct', () => {
  const runProductText = readText(RUN_PRODUCT);
  const specText = readText(SPEC_CLI);
  const orchestratorText = readText(RUN_ORCHESTRATOR);

  assert.equal(
    runProductText.includes('runIdOverride = \'\''),
    true,
    'runProduct should accept an optional runIdOverride argument',
  );
  assert.equal(
    runProductText.includes('const normalizedRunIdOverride = String(runIdOverride || \'\').trim();'),
    true,
    'runProduct should normalize runIdOverride before selecting run id',
  );
  assert.equal(
    runProductText.includes('const runId = /^[A-Za-z0-9._-]{8,96}$/.test(normalizedRunIdOverride)'),
    true,
    'runProduct should use validated override run id when present',
  );

  assert.equal(
    specText.includes('const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(requestedRunIdRaw)'),
    true,
    'spec indexlab command should parse/validate --run-id input',
  );
  assert.equal(
    specText.includes('runIdOverride: requestedRunId || undefined'),
    true,
    'non-convergence indexlab runs should forward requested run id into runProduct',
  );
  assert.equal(
    specText.includes('initialRunId: requestedRunId || undefined'),
    true,
    'convergence loop should forward requested run id into initial round',
  );

  assert.equal(
    orchestratorText.includes('runIdOverride: round === 0 ? String(initialRunId || \'\').trim() : \'\''),
    true,
    'runOrchestrator should pass initialRunId as runIdOverride for round 0 only',
  );
});
