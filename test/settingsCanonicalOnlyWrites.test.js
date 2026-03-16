import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout_waiting_for_json_persist:${filePath}:${JSON.stringify(lastValue)}`);
}

test('canonical-only settings write mode skips legacy snapshot files and persists user-settings only', { timeout: 90_000 }, async (t) => {
  const repoRoot = path.resolve('.');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-canonical-only-'));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const outputRoot = path.join(tempRoot, 'out');
  const inputRoot = path.join(tempRoot, 'fixtures');

  let child = null;
  let stderr = '';
  let stdout = '';

  t.after(async () => {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  });

  const port = await getFreePort();
  const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');
  child = spawn(
    process.execPath,
    [guiServerPath, '--port', String(port), '--local'],
    {
      cwd: tempRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: helperRoot,
        LOCAL_OUTPUT_ROOT: outputRoot,
        LOCAL_INPUT_ROOT: inputRoot,
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
        SETTINGS_CANONICAL_ONLY_WRITES: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  await waitForHttpReady(`${baseUrl}/health`);

  const runtimeRes = await fetch(`${baseUrl}/runtime-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fetchConcurrency: 11 }),
  });
  assert.equal(runtimeRes.status, 200, `runtime put failed; stdout=${stdout} stderr=${stderr}`);

  const convergenceRes = await fetch(`${baseUrl}/convergence-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serpTriageMinScore: 3 }),
  });
  assert.equal(convergenceRes.status, 200, `convergence put failed; stdout=${stdout} stderr=${stderr}`);

  const storageDirectory = path.join(tempRoot, 'run-data');
  const storageRes = await fetch(`${baseUrl}/storage-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      destinationType: 'local',
      localDirectory: storageDirectory,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    }),
  });
  assert.equal(storageRes.status, 200, `storage put failed; stdout=${stdout} stderr=${stderr}`);

  const runtimeRoot = path.join(helperRoot, '_runtime');
  const userSettingsPath = path.join(runtimeRoot, 'user-settings.json');
  const userSettings = await readJsonFileUntil(
    userSettingsPath,
    (json) => (
      json?.runtime?.concurrency === 11
      && json?.convergence?.serpTriageMinScore === 3
      && json?.storage?.destinationType === 'local'
      && json?.storage?.localDirectory === storageDirectory
    ),
  );
  assert.equal(userSettings.runtime.concurrency, 11);
  assert.equal(userSettings.convergence.serpTriageMinScore, 3);
  assert.equal(userSettings.storage.destinationType, 'local');
  assert.equal(userSettings.storage.localDirectory, storageDirectory);

  const legacySettingsExists = await fs.access(path.join(runtimeRoot, 'settings.json')).then(() => true).catch(() => false);
  const legacyConvergenceExists = await fs.access(path.join(runtimeRoot, 'convergence-settings.json')).then(() => true).catch(() => false);
  const legacyStorageExists = await fs.access(path.join(runtimeRoot, 'storage-settings.json')).then(() => true).catch(() => false);
  assert.equal(legacySettingsExists, false, 'legacy runtime settings snapshot should not be written in canonical-only mode');
  assert.equal(legacyConvergenceExists, false, 'legacy convergence snapshot should not be written in canonical-only mode');
  assert.equal(legacyStorageExists, false, 'legacy storage snapshot should not be written in canonical-only mode');
});
