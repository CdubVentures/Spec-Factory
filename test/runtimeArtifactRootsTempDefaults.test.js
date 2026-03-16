import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const suiteTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-runtime-defaults-'));
const previousTempEnv = {
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  TMPDIR: process.env.TMPDIR,
  LOCAL_OUTPUT_ROOT: process.env.LOCAL_OUTPUT_ROOT,
};

process.env.TEMP = suiteTempRoot;
process.env.TMP = suiteTempRoot;
process.env.TMPDIR = suiteTempRoot;
delete process.env.LOCAL_OUTPUT_ROOT;

const { defaultIndexLabRoot, defaultLocalOutputRoot } = await import('../src/core/config/runtimeArtifactRoots.js');
const { loadConfig } = await import('../src/config.js');
const { IndexLabRuntimeBridge } = await import('../src/indexlab/runtimeBridge.js');
const { relocateRunDataForCompletedRun } = await import('../src/api/services/runDataRelocationService.js');
const { handleIndexLabProcessCompletion } = await import('../src/api/services/indexLabProcessCompletion.js');
const { resolveSmokeLocalOutputPaths } = await import('../src/cli/smokeLocal.js');

function isWithin(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function writeUtf8(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url, timeoutMs = 25_000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout_waiting_for_http_ready:${url}`);
}

test.after(async () => {
  if (previousTempEnv.TEMP === undefined) delete process.env.TEMP;
  else process.env.TEMP = previousTempEnv.TEMP;
  if (previousTempEnv.TMP === undefined) delete process.env.TMP;
  else process.env.TMP = previousTempEnv.TMP;
  if (previousTempEnv.TMPDIR === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previousTempEnv.TMPDIR;
  if (previousTempEnv.LOCAL_OUTPUT_ROOT === undefined) delete process.env.LOCAL_OUTPUT_ROOT;
  else process.env.LOCAL_OUTPUT_ROOT = previousTempEnv.LOCAL_OUTPUT_ROOT;
  await fs.rm(suiteTempRoot, { recursive: true, force: true });
});

async function runCliJson(args, env = {}) {
  const cliPath = path.resolve('src/cli/spec.js');
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      ...env,
    },
  });
  return JSON.parse(stdout);
}

test('runtime artifact default roots resolve under OS temp instead of the repo', () => {
  const repoRoot = path.resolve('.');
  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();

  assert.equal(path.isAbsolute(outputRoot), true);
  assert.equal(path.isAbsolute(indexLabRoot), true);
  assert.equal(isWithin(suiteTempRoot, outputRoot), true);
  assert.equal(isWithin(suiteTempRoot, indexLabRoot), true);
  assert.equal(isWithin(repoRoot, outputRoot), false);
  assert.equal(isWithin(repoRoot, indexLabRoot), false);
});

test('loadConfig defaults localOutputRoot to the temp artifact root when LOCAL_OUTPUT_ROOT is unset', () => {
  delete process.env.LOCAL_OUTPUT_ROOT;
  const config = loadConfig();
  assert.equal(config.localOutputRoot, defaultLocalOutputRoot());
});

test('IndexLabRuntimeBridge defaults outRoot to the temp indexlab root', () => {
  const bridge = new IndexLabRuntimeBridge();
  assert.equal(bridge.outRoot, defaultIndexLabRoot());
});

test('relocateRunDataForCompletedRun uses temp default roots when run roots are omitted', async () => {
  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();
  const destinationRoot = path.join(suiteTempRoot, 'archive-relocate');
  const runId = 'run-temp-default-relocate-001';
  const category = 'mouse';
  const productId = 'mouse-temp-default-relocate';

  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId, 'logs', 'summary.json'),
    JSON.stringify({ run_id: runId, ok: true }, null, 2),
  );
  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
    }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, '_runtime', 'events.jsonl'),
    `${JSON.stringify({ run_id: runId, event: 'run_completed' })}\n`,
  );

  const result = await relocateRunDataForCompletedRun({
    settings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
      awsRegion: '',
      s3Bucket: '',
      s3Prefix: '',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    },
    runMeta: {
      run_id: runId,
      category,
      product_id: productId,
      run_base: `specs/outputs/${category}/${productId}/runs/${runId}`,
      latest_base: `specs/outputs/${category}/${productId}/latest`,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(
    await pathExists(path.join(destinationRoot, category, productId, runId, 'indexlab', 'run.json')),
    true,
  );
  assert.equal(
    await pathExists(path.join(destinationRoot, category, productId, runId, 'run_output', 'logs', 'summary.json')),
    true,
  );
});

test('handleIndexLabProcessCompletion resolves omitted run-data roots from temp defaults', async () => {
  const outputRoot = defaultLocalOutputRoot();
  const indexLabRoot = defaultIndexLabRoot();
  const destinationRoot = path.join(suiteTempRoot, 'archive-completion');
  const runId = 'run-temp-default-completion-001';
  const category = 'mouse';
  const productId = 'mouse-temp-default-completion';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-03-07T00:00:00.000Z',
      ended_at: '2026-03-07T00:02:00.000Z',
      run_base: `specs/outputs/${category}/${productId}/runs/${runId}`,
      latest_base: `specs/outputs/${category}/${productId}/latest`,
    }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId, 'summary.json'),
    JSON.stringify({ ok: true, run_id: runId }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, '_runtime', 'events.jsonl'),
    `${JSON.stringify({ run_id: runId, event: 'run_completed' })}\n`,
  );

  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['indexlab', '--local', '--category', category, '--product-id', productId],
    startedAt: '2026-03-07T00:00:01.000Z',
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
      awsRegion: '',
      s3Bucket: '',
      s3Prefix: '',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    },
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.run_id, runId);
  assert.equal(
    await pathExists(path.join(destinationRoot, category, productId, runId, 'indexlab', 'run.json')),
    true,
  );
});

test('gui server startup defaults output and indexlab roots to temp paths when no overrides are provided', { timeout: 90_000 }, async () => {
  const repoRoot = path.resolve('.');
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');
  const expectedOutputRoot = defaultLocalOutputRoot();
  const expectedIndexLabRoot = defaultIndexLabRoot();
  const port = await getFreePort();
  const helperRoot = path.join(suiteTempRoot, 'runtime-artifact-roots-helper');

  let child = null;
  let stdout = '';
  let stderr = '';

  try {
    await fs.mkdir(helperRoot, { recursive: true });
    child = spawn(process.execPath, [guiServerPath, '--port', String(port), '--local'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TEMP: suiteTempRoot,
        TMP: suiteTempRoot,
        TMPDIR: suiteTempRoot,
        HELPER_FILES_ROOT: helperRoot,
        CATEGORY_AUTHORITY_ROOT: helperRoot,
        LOCAL_OUTPUT_ROOT: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

    assert.equal(
      stdout.includes(`[gui-server] Output:  ${expectedOutputRoot}`),
      true,
      `expected temp output root in startup logs; stdout=${stdout} stderr=${stderr}`,
    );
    assert.equal(
      stdout.includes(`[gui-server] IndexLab:${expectedIndexLabRoot}`),
      true,
      `expected temp indexlab root in startup logs; stdout=${stdout} stderr=${stderr}`,
    );
  } finally {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
  }
});

test('indexlab CLI defaults --out to the temp indexlab root when omitted', { timeout: 120_000 }, async () => {
  const inputRoot = path.join(suiteTempRoot, 'cli-input');
  await fs.mkdir(inputRoot, { recursive: true });

  const result = await runCliJson([
    'indexlab',
    '--local',
    '--local-input-root', inputRoot,
    '--category', 'mouse',
    '--seed', 'Synthetic Probe',
    '--brand', 'Probe',
    '--model', 'Alpha',
    '--search-provider', 'none',
    '--discovery-enabled', 'false',
    '--max-run-seconds', '1',
  ], {
    TEMP: suiteTempRoot,
    TMP: suiteTempRoot,
    TMPDIR: suiteTempRoot,
    LOCAL_OUTPUT_ROOT: '',
  });

  assert.equal(result.command, 'indexlab');
  assert.equal(result.indexlab.out_root, defaultIndexLabRoot());
  assert.equal(isWithin(suiteTempRoot, result.indexlab.run_dir), true);
});

test('smoke local output paths default to the temp output root', () => {
  const paths = resolveSmokeLocalOutputPaths();
  assert.equal(paths.outputRoot, defaultLocalOutputRoot());
  assert.equal(paths.normalizedOutPath, path.join(defaultLocalOutputRoot(), 'normalized', 'spec.normalized.json'));
  assert.equal(paths.summaryOutPath, path.join(defaultLocalOutputRoot(), 'logs', 'summary.json'));
});
