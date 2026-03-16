import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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

  if (needsApi && !apiTrackedPidRunning && apiPortOccupied) {
    return {
      ok: false,
      error: `Spec Factory API port ${contract.api.port} is already in use by another process.`,
      startApi: false,
      startGui: false,
      openUrl: null,
    };
  }

  if (needsGui && !guiTrackedPidRunning && guiPortOccupied) {
    return {
      ok: false,
      error: `Spec Factory GUI port ${contract.gui.port} is already in use by another process.`,
      startApi: false,
      startGui: false,
      openUrl: null,
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

async function run(action, root) {
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

  if (plan.openUrl) {
    openBrowser(plan.openUrl);
    console.log(`Opened ${plan.openUrl}`);
  }

  console.log(`API log: ${contract.api.logFile}`);
  console.log(`GUI log: ${contract.gui.logFile}`);
  return 0;
}

async function main() {
  const action = process.argv[2];
  const root = process.cwd();

  if (action !== 'start-stack' && action !== 'start-api' && action !== 'refresh-page') {
    console.error('Usage: node tools/dev-stack-control.js <start-stack|start-api|refresh-page>');
    process.exitCode = 1;
    return;
  }

  process.exitCode = await run(action, root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  void main();
}
