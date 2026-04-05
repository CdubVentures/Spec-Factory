import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

function isWithin(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// WHY: Runtime artifacts live under .workspace/ in the project root,
// not in %LOCALAPPDATA% or os.tmpdir().
test('runtime artifact defaults resolve under .workspace relative to CWD', async () => {
  const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../runtimeArtifactRoots.js');
  const tempDir = os.tmpdir();
  const cwd = process.cwd();
  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();

  assert.equal(path.isAbsolute(outputRoot), true, 'output root must be absolute');
  assert.equal(path.isAbsolute(indexLabRoot), true, 'indexlab root must be absolute');

  const expectedOutput = path.resolve(cwd, '.workspace', 'output');
  const expectedRuns = path.resolve(cwd, '.workspace', 'runs');
  assert.equal(outputRoot, expectedOutput, `output root should be ${expectedOutput}, got ${outputRoot}`);
  assert.equal(indexLabRoot, expectedRuns, `indexlab root should be ${expectedRuns}, got ${indexLabRoot}`);

  assert.equal(isWithin(tempDir, outputRoot), false, `output root must NOT be under temp ${tempDir}`);
  assert.equal(isWithin(tempDir, indexLabRoot), false, `indexlab root must NOT be under temp ${tempDir}`);
});

test('config, runtime bridge, and smoke-local helpers reuse the .workspace artifact defaults', async () => {
  const { loadConfig } = await import('../../../config.js');
  const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../runtimeArtifactRoots.js');
  const { IndexLabRuntimeBridge } = await import('../../../indexlab/runtimeBridge.js');
  const { resolveSmokeLocalOutputPaths } = await import('../../../app/cli/smokeLocal.js');

  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();
  const config = loadConfig();
  const bridge = new IndexLabRuntimeBridge();
  const smokePaths = resolveSmokeLocalOutputPaths();

  assert.equal(config.localOutputRoot, outputRoot);
  assert.equal(bridge.outRoot, indexLabRoot);
  assert.equal(smokePaths.outputRoot, outputRoot);
  assert.equal(smokePaths.normalizedOutPath, path.join(outputRoot, 'normalized', 'spec.normalized.json'));
  assert.equal(smokePaths.summaryOutPath, path.join(outputRoot, 'logs', 'summary.json'));
});
