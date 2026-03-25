import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runNativeModulePreflight, getNodeDiagnostics, getCategoryList } from './nativeModulePreflight.js';

const HOST = '127.0.0.1';
const STATE_DIRNAME = '.server-state';
const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

export const SPEC_FACTORY_PORTS = {
  api: 8788,
  gui: 8788,
};

export function getSpecFactoryServerContract(root) {
  const stateDir = path.join(root, STATE_DIRNAME);
  const guiReactRoot = path.join(root, 'tools', 'gui-react');

  return {
    api: {
      key: 'api',
      port: SPEC_FACTORY_PORTS.api,
      browserUrl: `http://${HOST}:${SPEC_FACTORY_PORTS.api}`,
      pidFile: path.join(stateDir, 'spec-factory-api.pid'),
      logFile: path.join(stateDir, 'spec-factory-api.log'),
      workingDirectory: root,
      command: process.execPath,
      args: [
        path.join(root, 'src', 'api', 'guiServer.js'),
        '--port',
        String(SPEC_FACTORY_PORTS.api),
        '--local',
      ],
    },
    gui: {
      key: 'gui',
      port: SPEC_FACTORY_PORTS.gui,
      browserUrl: `http://${HOST}:${SPEC_FACTORY_PORTS.gui}`,
      pidFile: path.join(stateDir, 'spec-factory-gui.pid'),
      logFile: path.join(stateDir, 'spec-factory-gui.log'),
      workingDirectory: guiReactRoot,
      command: process.execPath,
      args: [
        path.join(guiReactRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      ],
    },
  };
}

export function planSpecFactoryAction({
  action,
  root,
  apiTrackedPidRunning,
  apiPortOccupied,
  guiTrackedPidRunning,
  guiPortOccupied,
  timestamp = Date.now(),
}) {
  const contract = getSpecFactoryServerContract(root);
  const needsApi = action === 'start-stack' || action === 'start-api';
  const needsGui = false;

  // WHY: If the port is already occupied (even by an untracked process),
  // skip starting and just open the browser to the existing server.
  if (needsApi && !apiTrackedPidRunning && apiPortOccupied) {
    return {
      ok: true,
      startApi: false,
      startGui: false,
      openUrl: contract.api.browserUrl,
    };
  }

  if (needsGui && !guiTrackedPidRunning && guiPortOccupied) {
    return {
      ok: true,
      startApi: false,
      startGui: false,
      openUrl: contract.gui.browserUrl,
    };
  }

  if (action === 'refresh-page') {
    const apiUrl = `${contract.api.browserUrl}/?refresh=${timestamp}`;

    return {
      ok: true,
      startApi: false,
      startGui: false,
      openUrl: apiUrl,
    };
  }

  return {
    ok: true,
    startApi: needsApi && !apiTrackedPidRunning,
    startGui: needsGui && !guiTrackedPidRunning,
    openUrl: action === 'start-api' ? contract.api.browserUrl : contract.gui.browserUrl,
  };
}

function ensureStateDir(root) {
  const stateDir = path.join(root, STATE_DIRNAME);
  mkdirSync(stateDir, { recursive: true });
  return stateDir;
}

function readTrackedPid(pidFile) {
  try {
    const raw = readFileSync(pidFile, 'utf8').trim();
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeFileIfPresent(filePath) {
  try {
    rmSync(filePath, { force: true, recursive: true });
  } catch {
    // Ignore stale cleanup failures.
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortOccupied(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: HOST, port });
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(300, () => finish(false));
  });
}

async function waitForPort(port, occupied, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const current = await isPortOccupied(port);
    if (current === occupied) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

function startManagedProcess(server) {
  const logFd = openSync(server.logFile, 'a');

  try {
    const child = spawn(server.command, server.args ?? [], {
      cwd: server.workingDirectory,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });

    child.unref();
    writeFileSync(server.pidFile, `${child.pid}\n`, 'utf8');
  } finally {
    closeSync(logFd);
  }
}

function openBrowser(url) {
  const browserCommand = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(browserCommand, [url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
}

async function run(action, root, { noBrowser = false } = {}) {
  const contract = getSpecFactoryServerContract(root);
  ensureStateDir(root);

  const apiTrackedPid = readTrackedPid(contract.api.pidFile);
  const guiTrackedPid = readTrackedPid(contract.gui.pidFile);
  const apiTrackedPidRunning = apiTrackedPid != null && isProcessRunning(apiTrackedPid);
  const guiTrackedPidRunning = guiTrackedPid != null && isProcessRunning(guiTrackedPid);

  if (!apiTrackedPidRunning) {
    removeFileIfPresent(contract.api.pidFile);
  }

  if (!guiTrackedPidRunning) {
    removeFileIfPresent(contract.gui.pidFile);
  }

  const apiPortOccupied = await isPortOccupied(contract.api.port);
  const guiPortOccupied = await isPortOccupied(contract.gui.port);
  const plan = planSpecFactoryAction({
    action,
    root,
    apiTrackedPidRunning,
    apiPortOccupied,
    guiTrackedPidRunning,
    guiPortOccupied,
  });

  if (!plan.ok) {
    console.error(plan.error);
    return 1;
  }

  if (plan.startApi) {
    // ── Preflight: Node diagnostics + native module validation ──
    const diag = getNodeDiagnostics();
    console.log(`[preflight] Node ${diag.version} (${diag.execPath})`);
    console.log(`[preflight] MODULE_VERSION: ${diag.moduleVersion}, arch: ${diag.arch}`);

    const preflight = await runNativeModulePreflight({ root });
    if (!preflight.ok) {
      console.error(`[preflight] FATAL: better-sqlite3 cannot load (${preflight.status})`);
      console.error(`[preflight] ${preflight.errorMessage}`);
      if (preflight.rebuildAttempted && !preflight.rebuildSucceeded) {
        console.error('[preflight] Auto-rebuild failed. Manual fix: npm rebuild better-sqlite3');
      }
      return 1;
    }
    console.log(`[preflight] better-sqlite3: OK${preflight.rebuildAttempted ? ' (auto-rebuilt)' : ''}`);

    const categories = getCategoryList(root);
    console.log(`[preflight] Categories: ${categories.length} (${categories.join(', ') || 'none'})`);

    startManagedProcess(contract.api);
    const apiReady = await waitForPort(contract.api.port, true, START_TIMEOUT_MS);
    if (!apiReady) {
      console.error(`API did not open ${contract.api.browserUrl} within ${START_TIMEOUT_MS}ms.`);
      console.error(`Check ${contract.api.logFile} for details.`);
      return 1;
    }
  }

  if (plan.startGui) {
    startManagedProcess(contract.gui);
  }

  if (action === 'start-stack') {
    const guiReady = await waitForPort(contract.gui.port, true, START_TIMEOUT_MS);
    if (!guiReady) {
      console.error(`GUI did not open ${contract.gui.browserUrl} within ${START_TIMEOUT_MS}ms.`);
      console.error(`Check ${contract.gui.logFile} for details.`);
      return 1;
    }
  }

  if (action === 'start-api' && !plan.startApi && apiTrackedPidRunning) {
    const apiReady = await waitForPort(contract.api.port, true, START_TIMEOUT_MS);
    if (!apiReady) {
      console.error(`API did not open ${contract.api.browserUrl} within ${START_TIMEOUT_MS}ms.`);
      console.error(`Check ${contract.api.logFile} for details.`);
      return 1;
    }
  }

  if (action === 'start-stack' && !plan.startGui && guiTrackedPidRunning) {
    const guiReady = await waitForPort(contract.gui.port, true, START_TIMEOUT_MS);
    if (!guiReady) {
      console.error(`GUI did not open ${contract.gui.browserUrl} within ${START_TIMEOUT_MS}ms.`);
      console.error(`Check ${contract.gui.logFile} for details.`);
      return 1;
    }
  }

  if (plan.openUrl && !noBrowser) {
    openBrowser(plan.openUrl);
    console.log(`Opened ${plan.openUrl}`);
  }

  console.log(`API log: ${contract.api.logFile}`);
  console.log(`GUI log: ${contract.gui.logFile}`);
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const noBrowser = args.includes('--no-browser');
  const action = args.find((a) => !a.startsWith('--'));
  const root = process.cwd();

  if (action !== 'start-stack' && action !== 'start-api' && action !== 'refresh-page') {
    console.error('Usage: node tools/dev-stack-control.js <start-stack|start-api|refresh-page> [--no-browser]');
    process.exitCode = 1;
    return;
  }

  process.exitCode = await run(action, root, { noBrowser });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  void main();
}
