import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';

function waitForExitOrTimeout(child, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ timeout: true, code: null, signal: null });
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ timeout: false, code, signal });
    });
  });
}

test('indexlab spawned with IPC exits after command completion', { timeout: 95_000 }, async () => {
  const runId = `ipc_exit_${Date.now()}`;
  const maxRunSeconds = 30;
  const cliArgs = [
    'src/cli/spec.js',
    'indexlab',
    '--local',
    '--run-id', runId,
    '--category', 'mouse',
    '--product-id', 'mouse-razer-viper-v3-pro-black',
    '--discovery-enabled', 'false',
    '--search-provider', 'none',
    '--max-run-seconds', String(maxRunSeconds),
  ];

  const child = spawn('node', cliArgs, {
    cwd: path.resolve('.'),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      LOCAL_MODE: 'true',
      HELPER_FILES_ROOT: path.resolve('category_authority'),
    },
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk || '');
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk || '');
  });

  // Allow extra shutdown margin because IPC-attached indexlab runs can complete slightly after max-run window.
  const exitTimeoutMs = Math.max(45_000, (maxRunSeconds + 30) * 1000);
  const result = await waitForExitOrTimeout(child, exitTimeoutMs);
  if (result.timeout) {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    assert.fail([
      'indexlab child did not exit with IPC channel attached',
      `run_id=${runId}`,
      `stdout_tail=${stdout.slice(-400)}`,
      `stderr_tail=${stderr.slice(-300)}`,
    ].join('\n'));
  }

  assert.equal(result.code, 0, `indexlab child should exit 0 (signal=${String(result.signal || '')})`);
});
