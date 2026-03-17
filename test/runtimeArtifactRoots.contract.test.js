import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function isWithin(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function withTempArtifactEnv(run) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-runtime-roots-'));
  const previousEnv = {
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TMPDIR: process.env.TMPDIR,
    LOCAL_OUTPUT_ROOT: process.env.LOCAL_OUTPUT_ROOT,
  };

  process.env.TEMP = tempRoot;
  process.env.TMP = tempRoot;
  process.env.TMPDIR = tempRoot;
  delete process.env.LOCAL_OUTPUT_ROOT;

  try {
    await run(tempRoot);
  } finally {
    if (previousEnv.TEMP === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousEnv.TEMP;
    if (previousEnv.TMP === undefined) delete process.env.TMP;
    else process.env.TMP = previousEnv.TMP;
    if (previousEnv.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousEnv.TMPDIR;
    if (previousEnv.LOCAL_OUTPUT_ROOT === undefined) delete process.env.LOCAL_OUTPUT_ROOT;
    else process.env.LOCAL_OUTPUT_ROOT = previousEnv.LOCAL_OUTPUT_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test('runtime artifact defaults resolve under temp roots without repo-local fallbacks', async () => {
  await withTempArtifactEnv(async (tempRoot) => {
    const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../src/core/config/runtimeArtifactRoots.js');
    const repoRoot = path.resolve('.');
    const outputRoot = defaultLocalOutputRoot();
    const indexLabRoot = defaultIndexLabRoot();

    assert.equal(path.isAbsolute(outputRoot), true);
    assert.equal(path.isAbsolute(indexLabRoot), true);
    assert.equal(isWithin(tempRoot, outputRoot), true);
    assert.equal(isWithin(tempRoot, indexLabRoot), true);
    assert.equal(isWithin(repoRoot, outputRoot), false);
    assert.equal(isWithin(repoRoot, indexLabRoot), false);
  });
});

test('config, runtime bridge, and smoke-local helpers reuse the temp-root artifact defaults', async () => {
  await withTempArtifactEnv(async (tempRoot) => {
    const cacheBust = `?runtime-artifacts=${Date.now()}`;
    const [{ loadConfig }, { defaultIndexLabRoot, defaultLocalOutputRoot }, { IndexLabRuntimeBridge }, { resolveSmokeLocalOutputPaths }] = await Promise.all([
      import(`../src/config.js${cacheBust}`),
      import(`../src/core/config/runtimeArtifactRoots.js${cacheBust}`),
      import(`../src/indexlab/runtimeBridge.js${cacheBust}`),
      import(`../src/cli/smokeLocal.js${cacheBust}`),
    ]);
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
    assert.equal(isWithin(tempRoot, smokePaths.outputRoot), true);
  });
});
