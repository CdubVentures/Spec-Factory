import { createSearxngRuntime } from './searxngRuntime.js';
import { killWindowsProcessTree, findOrphanIndexLabPids } from './processOrphanOps.js';
import { runCommandCapture as _runCommandCapture } from './commandCapture.js';
import {
  createInitialProcessState,
  processStateReducer,
  deriveProcessStatus,
  normalizeRunIdToken,
  resolveProcessStorageDestination,
} from './processLifecycleState.js';

function assertFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

function extractRunIdFromCliArgs(cliArgs = []) {
  const args = Array.isArray(cliArgs) ? cliArgs : [];
  for (let idx = 0; idx < args.length; idx += 1) {
    const token = String(args[idx] || '');
    if (token === '--run-id') {
      return normalizeRunIdToken(args[idx + 1]);
    }
  }
  return '';
}

function extractCliArgValue(cliArgs = [], argName = '') {
  const args = Array.isArray(cliArgs) ? cliArgs : [];
  const needle = String(argName || '').trim();
  if (!needle) return '';
  for (let idx = 0; idx < args.length; idx += 1) {
    if (String(args[idx] || '').trim() !== needle) continue;
    return String(args[idx + 1] || '').trim();
  }
  return '';
}

export function createProcessRuntime({
  resolveProjectPath,
  path,
  fsSync,
  config,
  spawn,
  execCb,
  broadcastWs,
  sessionCache,
  invalidateFieldRulesCache,
  reviewLayoutByCategory,
  syncSpecDbForCategory,
  handleCompileProcessCompletion,
  handleIndexLabProcessCompletion,
  runDataStorageState,
  indexLabRoot,
  outputRoot,
  outputPrefix = 'specs/outputs',
  logger = console,
  processRef = process,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  assertFunction('resolveProjectPath', resolveProjectPath);
  assertObject('path', path);
  assertObject('fsSync', fsSync);
  assertFunction('fsSync.existsSync', fsSync.existsSync?.bind(fsSync));
  assertObject('config', config);
  assertFunction('spawn', spawn);
  assertFunction('execCb', execCb);
  assertFunction('broadcastWs', broadcastWs);
  assertObject('sessionCache', sessionCache);
  assertFunction('invalidateFieldRulesCache', invalidateFieldRulesCache);
  assertObject('reviewLayoutByCategory', reviewLayoutByCategory);
  assertFunction('syncSpecDbForCategory', syncSpecDbForCategory);
  assertFunction('handleCompileProcessCompletion', handleCompileProcessCompletion);
  assertFunction('handleIndexLabProcessCompletion', handleIndexLabProcessCompletion);
  assertObject('runDataStorageState', runDataStorageState);
  assertObject('processRef', processRef);
  assertFunction('setTimeoutFn', setTimeoutFn);
  assertFunction('clearTimeoutFn', clearTimeoutFn);
  assertFunction('logger.error', logger.error?.bind(logger));

  let state = createInitialProcessState();
  let childProc = null;

  function dispatch(action) {
    state = processStateReducer(state, action);
  }

  function isProcessRunning() {
    return state.phase === 'running';
  }

  function processStatus() {
    return deriveProcessStatus(state, { runDataStorageState });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeoutFn(resolve, Math.max(0, Number(ms || 0))));
  }

  const runCommandCapture = (cmd, args, opts) =>
    _runCommandCapture(cmd, args, { ...opts, spawn, processRef, path, setTimeoutFn, clearTimeoutFn });

  const { getSearxngStatus, startSearxngStack } = createSearxngRuntime({
    config, processRef, fsSync, resolveProjectPath, path,
    fetchImpl, setTimeoutFn, clearTimeoutFn, runCommandCapture, sleep,
  });

  function startProcess(cmd, cliArgs, envOverrides = {}) {
    if (isProcessRunning()) {
      throw new Error('process_already_running');
    }
    const runId = extractRunIdFromCliArgs(cliArgs);
    const runtimeEnv = {
      ...processRef.env,
    };
    for (const [key, value] of Object.entries(envOverrides || {})) {
      if (!key) continue;
      if (value === undefined || value === null || value === '') continue;
      runtimeEnv[String(key)] = String(value);
    }
    const childNodeCommand = String(processRef.execPath || '').trim() || 'node';
    const child = spawn(childNodeCommand, [cmd, ...cliArgs], {
      cwd: resolveProjectPath('.'),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: runtimeEnv,
      windowsHide: true,
    });

    const startedAt = new Date().toISOString();
    const command = `${childNodeCommand} ${cmd} ${cliArgs.join(' ')}`;
    const resolvedOutputRoot = resolveProjectPath(envOverrides.LOCAL_OUTPUT_ROOT || outputRoot || '.');
    const resolvedIndexLabRoot = resolveProjectPath(extractCliArgValue(cliArgs, '--out') || indexLabRoot || '.');

    dispatch({
      type: 'PROCESS_STARTED',
      payload: {
        pid: child.pid || null,
        command,
        startedAt,
        runId: runId || null,
        category: extractCliArgValue(cliArgs, '--category') || null,
        productId: extractCliArgValue(cliArgs, '--product-id') || null,
        brand: extractCliArgValue(cliArgs, '--brand') || null,
        model: extractCliArgValue(cliArgs, '--model') || null,
        variant: extractCliArgValue(cliArgs, '--variant') || null,
        storageDestination: resolveProcessStorageDestination(runDataStorageState),
      },
    });

    child.stdout.on('data', (d) => {
      broadcastWs('process', d.toString().split('\n').filter(Boolean));
    });
    child.stderr.on('data', (d) => {
      broadcastWs('process', d.toString().split('\n').filter(Boolean));
    });
    child.on('exit', (code, signal) => {
      const resolvedExitCode = Number.isFinite(code) ? code : null;
      const resolvedSignal = String(signal || '').trim();
      broadcastWs(
        'process',
        [`[process exited with code ${resolvedExitCode === null ? 'null' : resolvedExitCode}${resolvedSignal ? ` signal ${resolvedSignal}` : ''}]`],
      );
      dispatch({
        type: 'PROCESS_EXITED',
        payload: { exitCode: resolvedExitCode, endedAt: new Date().toISOString() },
      });
      if (childProc === child) {
        childProc = null;
      }
      void (async () => {
        try {
          if (resolvedExitCode === 0) {
            await handleCompileProcessCompletion({
              exitCode: resolvedExitCode,
              cliArgs,
              sessionCache,
              invalidateFieldRulesCache,
              reviewLayoutByCategory,
              syncSpecDbForCategory,
              broadcastWs,
            });
          }
          dispatch({
            type: 'RELOCATION_STARTED',
            payload: { runId: state.snapshot.runId || 'unknown' },
          });
          broadcastWs('process-status', processStatus());
          try {
            await handleIndexLabProcessCompletion({
              exitCode: resolvedExitCode,
              cliArgs,
              startedAt,
              runDataStorageSettings: runDataStorageState,
              indexLabRoot: resolvedIndexLabRoot,
              outputRoot: resolvedOutputRoot,
              outputPrefix,
              broadcastWs,
            });
          } finally {
            dispatch({ type: 'RELOCATION_COMPLETED' });
            broadcastWs('process-status', processStatus());
          }
        } catch (error) {
          logger.error('[process-completion] failed', error);
        }
      })();
    });
    child.on('message', (msg) => {
      if (msg && msg.__screencast) {
        broadcastWs(msg.channel || 'screencast', msg);
      }
    });
    childProc = child;
    const status = processStatus();
    broadcastWs('process-status', status);
    return status;
  }

  function forwardScreencastControl(options = {}) {
    const subscribeWorkerId = String(
      options?.subscribeWorkerId ?? options?.screencast_subscribe ?? '',
    ).trim();
    const unsubscribe = Boolean(
      options?.unsubscribe ?? options?.screencast_unsubscribe ?? false,
    );

    const activeProc = childProc;
    if (!activeProc || activeProc.exitCode !== null || typeof activeProc.send !== 'function') {
      return false;
    }

    if (subscribeWorkerId) {
      try {
        activeProc.send({ type: 'screencast_subscribe', worker_id: subscribeWorkerId });
        return true;
      } catch {
        return false;
      }
    }

    if (unsubscribe) {
      try {
        activeProc.send({ type: 'screencast_unsubscribe' });
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  function waitForProcessExit(proc = childProc, timeoutMs = 7000) {
    const runningProc = proc;
    if (!runningProc || runningProc.exitCode !== null) {
      return Promise.resolve(true);
    }
    const limitMs = Math.max(250, Number.parseInt(String(timeoutMs || 7000), 10) || 7000);
    return new Promise((resolve) => {
      let finished = false;
      const onExit = () => {
        if (finished) return;
        finished = true;
        clearTimeoutFn(timer);
        resolve(true);
      };
      const timer = setTimeoutFn(() => {
        if (finished) return;
        finished = true;
        runningProc.off('exit', onExit);
        resolve(runningProc.exitCode !== null);
      }, limitMs);
      runningProc.once('exit', onExit);
    });
  }

  async function stopOrphanIndexLabProcesses(timeoutMs = 8000) {
    const currentPid = Number.parseInt(String(state.snapshot.pid || 0), 10);
    const targets = (await findOrphanIndexLabPids({ platform: processRef.platform, runCommandCapture }))
      .filter((pid) => !(Number.isFinite(currentPid) && currentPid > 0 && pid === currentPid));
    if (targets.length === 0) {
      return {
        attempted: false,
        killed: 0,
        pids: [],
      };
    }

    let killed = 0;
    for (const pid of targets) {
      let ok = false;
      if (processRef.platform === 'win32') {
        ok = await killWindowsProcessTree({ pid, platform: processRef.platform, execCb });
      } else {
        const term = await runCommandCapture('kill', ['-TERM', String(pid)], { timeoutMs: Math.min(3_000, timeoutMs) });
        if (!term.ok) {
          const force = await runCommandCapture('kill', ['-KILL', String(pid)], { timeoutMs: Math.min(3_000, timeoutMs) });
          ok = Boolean(force.ok);
        } else {
          ok = true;
        }
      }
      if (ok) killed += 1;
    }

    return {
      attempted: true,
      killed,
      pids: targets,
    };
  }

  async function stopProcess(timeoutMs = 8000, options = {}) {
    const force = Boolean(options?.force);
    const runningProc = childProc;
    if (!runningProc || runningProc.exitCode !== null) {
      const status = {
        ...processStatus(),
        stop_attempted: force,
        stop_confirmed: true,
        orphan_killed: 0,
      };
      if (force) {
        const orphanStop = await stopOrphanIndexLabProcesses(timeoutMs);
        status.stop_attempted = Boolean(orphanStop.attempted || force);
        status.orphan_killed = orphanStop.killed;
      }
      broadcastWs('process-status', status);
      return status;
    }

    // WHY: On Windows, SIGTERM/SIGKILL don't reliably kill child process trees.
    // Send SIGTERM with a short grace period, then go straight to tree kill.
    try { runningProc.kill('SIGTERM'); } catch { /* ignore */ }
    let exited = await waitForProcessExit(runningProc, Math.min(1500, timeoutMs));

    if (!exited && runningProc.exitCode === null) {
      await killWindowsProcessTree({ pid: runningProc.pid, platform: processRef.platform, execCb });
      exited = await waitForProcessExit(runningProc, Math.max(1000, timeoutMs - 2000));
    }
    let orphanKilled = 0;
    if (force) {
      const orphanStop = await stopOrphanIndexLabProcesses(timeoutMs);
      orphanKilled += Number(orphanStop.killed || 0);
      if (orphanStop.killed > 0) {
        exited = true;
      }
    }

    const status = {
      ...processStatus(),
      stop_attempted: true,
      stop_confirmed: Boolean(exited || runningProc.exitCode !== null || orphanKilled > 0),
      orphan_killed: orphanKilled,
    };
    broadcastWs('process-status', status);
    return status;
  }

  return {
    getSearxngStatus,
    startSearxngStack,
    startProcess,
    stopProcess,
    processStatus,
    isProcessRunning,
    waitForProcessExit,
    forwardScreencastControl,
  };
}
