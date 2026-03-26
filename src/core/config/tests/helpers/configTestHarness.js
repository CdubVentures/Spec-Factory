import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

export function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

export function withSavedEnv(keys, runTest) {
  const previous = snapshotEnv(keys);
  try {
    const result = runTest(previous);
    if (result && typeof result.then === 'function') {
      return result.finally(() => restoreEnv(previous));
    }
    restoreEnv(previous);
    return result;
  } catch (error) {
    restoreEnv(previous);
    throw error;
  }
}

export function cleanupDirSync(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort test cleanup.
  }
}

export function withTempDirSync(prefix, runTest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const result = runTest(dir);
    if (result && typeof result.then === 'function') {
      return result.finally(() => cleanupDirSync(dir));
    }
    cleanupDirSync(dir);
    return result;
  } catch (error) {
    cleanupDirSync(dir);
    throw error;
  }
}
