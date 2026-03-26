import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePidRows, killWindowsProcessTree, findOrphanIndexLabPids } from '../processOrphanOps.js';

// --- Contract: parsePidRows ---
// Input: any value (coerced to string)
// Output: number[] — unique, positive, finite integers from newline-separated text
// Invariants: deduplicates, filters NaN/negative/zero/Infinity

test('parsePidRows parses newline-separated PID strings into unique positive integers', () => {
  assert.deepEqual(parsePidRows('100\n200\n300'), [100, 200, 300]);
});

test('parsePidRows deduplicates repeated PIDs', () => {
  assert.deepEqual(parsePidRows('100\n200\n100'), [100, 200]);
});

test('parsePidRows filters non-finite values (NaN, negative, zero)', () => {
  assert.deepEqual(parsePidRows('100\nabc\n-5\n0\n200'), [100, 200]);
});

test('parsePidRows handles \\r\\n line endings', () => {
  assert.deepEqual(parsePidRows('100\r\n200\r\n300'), [100, 200, 300]);
});

test('parsePidRows returns empty array for empty/null/undefined input', () => {
  assert.deepEqual(parsePidRows(''), []);
  assert.deepEqual(parsePidRows(null), []);
  assert.deepEqual(parsePidRows(undefined), []);
});

test('parsePidRows trims whitespace around PID values', () => {
  assert.deepEqual(parsePidRows('  100  \n  200  '), [100, 200]);
});

// --- Contract: killWindowsProcessTree ---
// Input: { pid, platform, execCb }
// Output: Promise<boolean>
// Invariants:
//   - returns false if platform !== 'win32'
//   - returns false if pid is invalid (NaN, <=0, empty)
//   - calls `taskkill /PID <pid> /T /F` on win32

test('killWindowsProcessTree calls taskkill on win32 and resolves true on success', async () => {
  let issuedCommand = null;
  const result = await killWindowsProcessTree({
    pid: 1234,
    platform: 'win32',
    execCb: (cmd, cb) => {
      issuedCommand = cmd;
      cb(null);
    },
  });
  assert.equal(result, true);
  assert.equal(issuedCommand, 'taskkill /PID 1234 /T /F');
});

test('killWindowsProcessTree resolves false when execCb returns error', async () => {
  const result = await killWindowsProcessTree({
    pid: 1234,
    platform: 'win32',
    execCb: (cmd, cb) => { cb(new Error('access denied')); },
  });
  assert.equal(result, false);
});

test('killWindowsProcessTree resolves false on non-win32 platform', async () => {
  const result = await killWindowsProcessTree({
    pid: 1234,
    platform: 'linux',
    execCb: () => { throw new Error('should not be called'); },
  });
  assert.equal(result, false);
});

test('killWindowsProcessTree resolves false for invalid PIDs', async () => {
  const cases = [0, -1, NaN, '', null, undefined];
  for (const pid of cases) {
    const result = await killWindowsProcessTree({
      pid,
      platform: 'win32',
      execCb: () => { throw new Error('should not be called'); },
    });
    assert.equal(result, false, `Expected false for pid=${pid}`);
  }
});

// --- Contract: findOrphanIndexLabPids ---
// Input: { platform, runCommandCapture }
// Output: Promise<number[]>
// Invariants:
//   - uses powershell on win32, sh on other platforms
//   - returns [] when command fails and stdout is empty

test('findOrphanIndexLabPids parses PID output on win32', async () => {
  const commandCalls = [];
  const result = await findOrphanIndexLabPids({
    platform: 'win32',
    runCommandCapture: (cmd, args, opts) => {
      commandCalls.push({ cmd, args, opts });
      return { ok: true, stdout: '555\n666\n' };
    },
  });
  assert.deepEqual(result, [555, 666]);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].cmd, 'powershell');
  assert.deepEqual(commandCalls[0].args.slice(0, 2), ['-NoProfile', '-Command']);
  assert.ok(commandCalls[0].args[2].includes('Get-CimInstance Win32_Process'));
  assert.ok(commandCalls[0].args[2].includes("--mode\\s+indexlab"));
  assert.deepEqual(commandCalls[0].opts, { timeoutMs: 8_000 });
});

test('findOrphanIndexLabPids parses PID output on non-win32 platforms', async () => {
  const commandCalls = [];
  const result = await findOrphanIndexLabPids({
    platform: 'linux',
    runCommandCapture: (cmd, args, opts) => {
      commandCalls.push({ cmd, args, opts });
      return { ok: true, stdout: '111\n222\n' };
    },
  });
  assert.deepEqual(result, [111, 222]);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].cmd, 'sh');
  assert.equal(commandCalls[0].args[0], '-lc');
  assert.ok(commandCalls[0].args[1].includes('src/cli/(spec|indexlab)\\.js'));
  assert.ok(commandCalls[0].args[1].includes('--mode indexlab'));
  assert.deepEqual(commandCalls[0].opts, { timeoutMs: 8_000 });
});

test('findOrphanIndexLabPids returns empty array when command fails with empty stdout', async () => {
  const result = await findOrphanIndexLabPids({
    platform: 'linux',
    runCommandCapture: () => ({ ok: false, stdout: '' }),
  });
  assert.deepEqual(result, []);
});

test('findOrphanIndexLabPids parses stdout even when command reports failure', async () => {
  const result = await findOrphanIndexLabPids({
    platform: 'linux',
    runCommandCapture: () => ({ ok: false, stdout: '999\n' }),
  });
  assert.deepEqual(result, [999]);
});
