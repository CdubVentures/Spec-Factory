import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function isWithin(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// WHY: Persistent storage — defaults must survive reboots. On Windows
// this is LOCALAPPDATA, on macOS ~/Library/Application Support, on
// Linux XDG_DATA_HOME or ~/.local/share.
function expectedPersistentRoot() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

test('runtime artifact defaults resolve under persistent AppData, not temp', async () => {
  const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../runtimeArtifactRoots.js');
  const tempDir = os.tmpdir();
  const persistentRoot = expectedPersistentRoot();
  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();

  assert.equal(path.isAbsolute(outputRoot), true, 'output root must be absolute');
  assert.equal(path.isAbsolute(indexLabRoot), true, 'indexlab root must be absolute');
  assert.equal(isWithin(persistentRoot, outputRoot), true, `output root ${outputRoot} should be under persistent ${persistentRoot}`);
  assert.equal(isWithin(persistentRoot, indexLabRoot), true, `indexlab root ${indexLabRoot} should be under persistent ${persistentRoot}`);
  assert.equal(isWithin(tempDir, outputRoot), false, `output root ${outputRoot} must NOT be under temp ${tempDir}`);
  assert.equal(isWithin(tempDir, indexLabRoot), false, `indexlab root ${indexLabRoot} must NOT be under temp ${tempDir}`);
});

test('config, runtime bridge, and smoke-local helpers reuse the persistent artifact defaults', async () => {
  const { loadConfig } = await import('../../../config.js');
  const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../runtimeArtifactRoots.js');
  const { IndexLabRuntimeBridge } = await import('../../../indexlab/runtimeBridge.js');
  const { resolveSmokeLocalOutputPaths } = await import('../../../cli/smokeLocal.js');

  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();
  const config = loadConfig();
  const bridge = new IndexLabRuntimeBridge();
  const smokePaths = resolveSmokeLocalOutputPaths();
  const persistentRoot = expectedPersistentRoot();

  assert.equal(config.localOutputRoot, outputRoot);
  assert.equal(bridge.outRoot, indexLabRoot);
  assert.equal(smokePaths.outputRoot, outputRoot);
  assert.equal(smokePaths.normalizedOutPath, path.join(outputRoot, 'normalized', 'spec.normalized.json'));
  assert.equal(smokePaths.summaryOutPath, path.join(outputRoot, 'logs', 'summary.json'));
  assert.equal(isWithin(persistentRoot, smokePaths.outputRoot), true, `smoke output root should be under persistent ${persistentRoot}`);
});
