import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

const LEGACY_HELPER_DIR = `helper${'_files'}`;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
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
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout_waiting_for_http_ready:${url}`);
}

async function readJsonFileUntil(filePath, predicate, timeoutMs = 4_000) {
  const started = Date.now();
  let lastValue = null;
  while ((Date.now() - started) < timeoutMs) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      lastValue = parsed;
      if (predicate(parsed)) return parsed;
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`timeout_waiting_for_json_persist:${filePath}:${JSON.stringify(lastValue)}`);
}

function waitForProcessExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch {}
      reject(new Error('timeout_waiting_for_process_exit'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('gui server resolves relative helper root against project root when launched from non-root cwd', { timeout: 90_000 }, async (t) => {
  const repoRoot = path.resolve('.');
  const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gui-server-cwd-'));
  const relativeHelperRoot = path.join('.tmp', `gui-root-resolution-${Date.now()}`);
  const relativeOutputRoot = path.join('.tmp', `gui-output-resolution-${Date.now()}`);

  const expectedHelperRoot = path.join(repoRoot, relativeHelperRoot);
  const expectedUserSettingsPath = path.join(expectedHelperRoot, '_runtime', 'user-settings.json');
  const unexpectedUserSettingsPath = path.join(tempCwd, relativeHelperRoot, '_runtime', 'user-settings.json');

  let child = null;
  let stderr = '';
  let stdout = '';

  t.after(async () => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    await fs.rm(expectedHelperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(repoRoot, relativeOutputRoot), { recursive: true, force: true }).catch(() => {});
    await fs.rm(tempCwd, { recursive: true, force: true }).catch(() => {});
  });

  const port = await getFreePort();
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');

  child = spawn(
    process.execPath,
    [guiServerPath, '--port', String(port), '--local'],
    {
      cwd: tempCwd,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: relativeHelperRoot,
        LOCAL_OUTPUT_ROOT: relativeOutputRoot,
        LOCAL_INPUT_ROOT: path.join('.tmp', `gui-input-resolution-${Date.now()}`),
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

  await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

  const putRes = await fetch(`http://127.0.0.1:${port}/api/v1/ui-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      runtimeAutoSaveEnabled: false,
      studioAutoSaveAllEnabled: true,
    }),
  });
  assert.equal(
    putRes.status,
    200,
    `ui settings PUT should succeed; stderr=${stderr} stdout=${stdout}`,
  );

  const persisted = await readJsonFileUntil(
    expectedUserSettingsPath,
    (payload) => payload?.ui?.runtimeAutoSaveEnabled === false && payload?.ui?.studioAutoSaveAllEnabled === true,
  );
  assert.equal(persisted.ui.runtimeAutoSaveEnabled, false);
  assert.equal(persisted.ui.studioAutoSaveAllEnabled, true);

  const wroteInLaunchCwd = await fs.access(unexpectedUserSettingsPath).then(() => true).catch(() => false);
  assert.equal(
    wroteInLaunchCwd,
    false,
    `settings should not persist under launch cwd runtime path: ${unexpectedUserSettingsPath}`,
  );
});

test('gui server fails fast when launch cwd contains shadow legacy helper runtime', { timeout: 30_000 }, async (t) => {
  const repoRoot = path.resolve('.');
  const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gui-shadow-cwd-'));
  const shadowRuntimeDir = path.join(tempCwd, LEGACY_HELPER_DIR, '_runtime');
  const relativeHelperRoot = path.join('.tmp', `gui-shadow-canonical-${Date.now()}`);
  const canonicalHelperRoot = path.join(repoRoot, relativeHelperRoot);
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');

  await fs.mkdir(shadowRuntimeDir, { recursive: true });
  await fs.writeFile(path.join(shadowRuntimeDir, 'user-settings.json'), '{}\n', 'utf8');

  let child = null;
  let stderr = '';
  let stdout = '';

  t.after(async () => {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
    await fs.rm(canonicalHelperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tempCwd, { recursive: true, force: true }).catch(() => {});
  });

  const port = await getFreePort();
  child = spawn(
    process.execPath,
    [guiServerPath, '--port', String(port), '--local'],
    {
      cwd: tempCwd,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: relativeHelperRoot,
        LOCAL_OUTPUT_ROOT: path.join('.tmp', `gui-shadow-output-${Date.now()}`),
        LOCAL_INPUT_ROOT: path.join('.tmp', `gui-shadow-input-${Date.now()}`),
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

  const exit = await waitForProcessExit(child, 12_000);
  assert.notEqual(exit.code, 0, `gui server should fail fast on shadow helper runtime; stdout=${stdout} stderr=${stderr}`);
  assert.equal(
    (stderr + stdout).includes('shadow_helper_runtime_detected'),
    true,
    `expected shadow-helper guard marker in startup failure output; stdout=${stdout} stderr=${stderr}`,
  );
});

test('gui server boot roots honor enabled local storage settings from canonical user settings', { timeout: 90_000 }, async (t) => {
  const repoRoot = path.resolve('.');
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gui-storage-root-helper-'));
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gui-storage-root-target-'));
  const runtimeRoot = path.join(helperRoot, '_runtime');
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');
  const expectedOutputRoot = path.join(storageRoot, 'output');
  const expectedIndexLabRoot = path.join(storageRoot, 'indexlab');
  const expectedSpecDbDir = path.join(storageRoot, '.specfactory_tmp');
  const expectedLlmCacheDir = path.join(expectedSpecDbDir, 'llm_cache');

  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(
    path.join(runtimeRoot, 'user-settings.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      runtime: {},
      convergence: {},
      storage: {
        enabled: true,
        destinationType: 'local',
        localDirectory: storageRoot,
        awsRegion: 'us-east-2',
        s3Bucket: '',
        s3Prefix: 'spec-factory-runs',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3SessionToken: '',
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
      studio: {},
      ui: {
        studioAutoSaveAllEnabled: false,
        studioAutoSaveEnabled: true,
        studioAutoSaveMapEnabled: true,
        runtimeAutoSaveEnabled: true,
        storageAutoSaveEnabled: false,
        llmSettingsAutoSaveEnabled: true,
      },
    }, null, 2)}\n`,
    'utf8',
  );

  let child = null;
  let stderr = '';
  let stdout = '';

  t.after(async () => {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
    await fs.rm(helperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => {});
  });

  const port = await getFreePort();
  child = spawn(
    process.execPath,
    [guiServerPath, '--port', String(port), '--local'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: helperRoot,
        LOCAL_OUTPUT_ROOT: '',
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

  await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

  const runtimeSettingsRes = await fetch(`http://127.0.0.1:${port}/api/v1/runtime-settings`);
  assert.equal(
    runtimeSettingsRes.status,
    200,
    `expected runtime settings endpoint to succeed; stdout=${stdout} stderr=${stderr}`,
  );
  const runtimeSettings = await runtimeSettingsRes.json();

  assert.equal(
    stdout.includes(`[gui-server] Output:  ${expectedOutputRoot}`),
    true,
    `expected storage-root output path in startup logs; stdout=${stdout} stderr=${stderr}`,
  );
  assert.equal(
    stdout.includes(`[gui-server] IndexLab:${expectedIndexLabRoot}`),
    true,
    `expected storage-root indexlab path in startup logs; stdout=${stdout} stderr=${stderr}`,
  );
  assert.equal(
    runtimeSettings.specDbDir,
    expectedSpecDbDir,
    `expected storage-root spec db dir in runtime settings; stdout=${stdout} stderr=${stderr}`,
  );
  assert.equal(
    runtimeSettings.llmExtractionCacheDir,
    expectedLlmCacheDir,
    `expected storage-root llm cache dir in runtime settings; stdout=${stdout} stderr=${stderr}`,
  );
});

test('gui server boot with enabled s3 storage stages db and cache roots under temp workspace', { timeout: 90_000 }, async (t) => {
  const repoRoot = path.resolve('.');
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gui-storage-s3-helper-'));
  const runtimeRoot = path.join(helperRoot, '_runtime');
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');
  const expectedSpecDbDir = path.join(os.tmpdir(), 'spec-factory', '.specfactory_tmp');
  const expectedLlmCacheDir = path.join(expectedSpecDbDir, 'llm_cache');

  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(
    path.join(runtimeRoot, 'user-settings.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      runtime: {},
      convergence: {},
      storage: {
        enabled: true,
        destinationType: 's3',
        localDirectory: '',
        awsRegion: 'us-east-2',
        s3Bucket: 'my-spec-harvester-data',
        s3Prefix: 'spec-factory-runs',
        s3AccessKeyId: 'test-access-key',
        s3SecretAccessKey: 'test-secret-key',
        s3SessionToken: '',
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
      studio: {},
      ui: {
        studioAutoSaveAllEnabled: false,
        studioAutoSaveEnabled: true,
        studioAutoSaveMapEnabled: true,
        runtimeAutoSaveEnabled: true,
        storageAutoSaveEnabled: false,
        llmSettingsAutoSaveEnabled: true,
      },
    }, null, 2)}\n`,
    'utf8',
  );

  let child = null;
  let stderr = '';
  let stdout = '';

  t.after(async () => {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
    await fs.rm(helperRoot, { recursive: true, force: true }).catch(() => {});
  });

  const port = await getFreePort();
  child = spawn(
    process.execPath,
    [guiServerPath, '--port', String(port), '--local'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: helperRoot,
        LOCAL_OUTPUT_ROOT: '',
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

  await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

  const runtimeSettingsRes = await fetch(`http://127.0.0.1:${port}/api/v1/runtime-settings`);
  assert.equal(
    runtimeSettingsRes.status,
    200,
    `expected runtime settings endpoint to succeed; stdout=${stdout} stderr=${stderr}`,
  );
  const runtimeSettings = await runtimeSettingsRes.json();

  assert.equal(
    runtimeSettings.specDbDir,
    expectedSpecDbDir,
    `expected temp staging spec db dir in runtime settings; stdout=${stdout} stderr=${stderr}`,
  );
  assert.equal(
    runtimeSettings.llmExtractionCacheDir,
    expectedLlmCacheDir,
    `expected temp staging llm cache dir in runtime settings; stdout=${stdout} stderr=${stderr}`,
  );
});
