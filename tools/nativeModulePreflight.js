import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REBUILD_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 10_000;
const require = createRequire(import.meta.url);

// ── Node diagnostics ──

export function getNodeDiagnostics() {
  return {
    version: process.version,
    execPath: process.execPath,
    moduleVersion: Number(process.versions.modules),
    arch: process.arch,
    platform: process.platform,
  };
}

// ── Category discovery ──

export function getCategoryList(root) {
  const catDir = path.join(root, 'category_authority');
  try {
    return readdirSync(catDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

// ── Child-process probe ──

function spawnProbe(execPath, cwd) {
  return new Promise((resolve) => {
    const script = "try { require('better-sqlite3'); process.exit(0) } catch(e) { console.error(e.message); process.exit(1) }";
    try {
      execFile(execPath, ['-e', script], { cwd, timeout: PROBE_TIMEOUT_MS }, (error, _stdout, stderr) => {
        const output = (stderr || '').trim();
        if (!error) {
          resolve({ ok: true, output });
          return;
        }
        resolve({ ok: false, output, code: error.code });
      });
    } catch (error) {
      resolve({
        ok: false,
        output: error?.message || String(error),
        code: error?.code,
        spawnUnavailable: error?.code === 'EPERM',
      });
    }
  });
}

function probeInProcess() {
  try {
    require('better-sqlite3');
    return { ok: true, output: '' };
  } catch (error) {
    return {
      ok: false,
      output: error?.message || String(error),
      code: error?.code,
    };
  }
}

function classifyError(output) {
  if (!output) return 'unknown-error';
  if (output.includes('NODE_MODULE_VERSION') || output.includes('was compiled against')) return 'mismatch';
  if (output.includes('Cannot find module') || output.includes('MODULE_NOT_FOUND')) return 'missing';
  return 'unknown-error';
}

function spawnRebuild(root) {
  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      execFile(npmCmd, ['rebuild', 'better-sqlite3'], { cwd: root, timeout: REBUILD_TIMEOUT_MS }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: (stdout || '').trim(),
          stderr: (stderr || error?.message || '').trim(),
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        stdout: '',
        stderr: error?.message || String(error),
      });
    }
  });
}

// ── Main preflight ──

export async function runNativeModulePreflight({
  root,
  probeFn = spawnProbe,
  fallbackProbeFn = probeInProcess,
  rebuildFn = spawnRebuild,
} = {}) {
  const diag = getNodeDiagnostics();
  const base = {
    nodeVersion: diag.version,
    nodePath: diag.execPath,
    moduleVersion: diag.moduleVersion,
  };

  const spawnedProbe = await probeFn(diag.execPath, root);
  const firstProbe = spawnedProbe.spawnUnavailable ? await fallbackProbeFn({ root }) : spawnedProbe;
  if (firstProbe.ok) {
    return {
      ...base,
      ok: true,
      status: 'loaded',
      errorMessage: null,
      rebuildAttempted: false,
      rebuildSucceeded: null,
    };
  }

  const status = classifyError(firstProbe.output);
  if (status !== 'mismatch') {
    return {
      ...base,
      ok: false,
      status,
      errorMessage: firstProbe.output,
      rebuildAttempted: false,
      rebuildSucceeded: null,
    };
  }

  // Mismatch detected — attempt auto-rebuild
  const rebuild = await rebuildFn(root);
  if (!rebuild.ok) {
    return {
      ...base,
      ok: false,
      status: 'mismatch',
      errorMessage: firstProbe.output,
      rebuildAttempted: true,
      rebuildSucceeded: false,
    };
  }

  // Re-probe after rebuild
  const secondSpawnedProbe = await probeFn(diag.execPath, root);
  const secondProbe = secondSpawnedProbe.spawnUnavailable ? await fallbackProbeFn({ root }) : secondSpawnedProbe;
  if (secondProbe.ok) {
    return {
      ...base,
      ok: true,
      status: 'loaded',
      errorMessage: null,
      rebuildAttempted: true,
      rebuildSucceeded: true,
    };
  }

  return {
    ...base,
    ok: false,
    status: classifyError(secondProbe.output),
    errorMessage: secondProbe.output,
    rebuildAttempted: true,
    rebuildSucceeded: false,
  };
}

// ── Exported for test: error classification ──
export { classifyError };

// ── CLI entry ──

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);

if (isMain) {
  const root = process.cwd();
  const diag = getNodeDiagnostics();

  console.log(`[preflight] Node ${diag.version} (${diag.execPath})`);
  console.log(`[preflight] MODULE_VERSION: ${diag.moduleVersion}, arch: ${diag.arch}`);

  runNativeModulePreflight({ root }).then((result) => {
    if (result.ok) {
      console.log(`[preflight] better-sqlite3: OK`);
      if (result.rebuildAttempted) {
        console.log('[preflight] (auto-rebuilt to match current Node)');
      }
    } else {
      console.error(`[preflight] FAILED: ${result.status}`);
      console.error(`[preflight] ${result.errorMessage}`);
      if (result.rebuildAttempted && !result.rebuildSucceeded) {
        console.error('[preflight] Auto-rebuild failed. Manual fix:');
        console.error(`[preflight]   npm rebuild better-sqlite3`);
      }
    }

    const categories = getCategoryList(root);
    console.log(`[preflight] Categories: ${categories.length} (${categories.join(', ') || 'none'})`);

    process.exitCode = result.ok ? 0 : 1;
  });
}
