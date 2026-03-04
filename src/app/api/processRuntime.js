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

function normalizeRunIdToken(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  if (!/^[A-Za-z0-9._-]{8,96}$/.test(token)) return '';
  return token;
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

function normalizeUrlToken(value, fallback) {
  const raw = String(value || '').trim() || String(fallback || '').trim();
  try {
    const parsed = new URL(raw);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(fallback || '').trim().replace(/\/+$/, '');
  }
}

function parsePidRows(value) {
  return [...new Set(
    String(value || '')
      .split(/\r?\n/)
      .map((row) => Number.parseInt(String(row || '').trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0),
  )];
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
  getSpecDbReady,
  resolveCategoryAlias,
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
  assertFunction('getSpecDbReady', getSpecDbReady);
  assertFunction('resolveCategoryAlias', resolveCategoryAlias);
  assertObject('processRef', processRef);
  assertFunction('setTimeoutFn', setTimeoutFn);
  assertFunction('clearTimeoutFn', clearTimeoutFn);
  assertFunction('logger.error', logger.error?.bind(logger));

  let childProc = null;
  let childLog = [];
  const MAX_LOG = 2000;
  let lastProcessSnapshot = {
    pid: null,
    command: null,
    startedAt: null,
    runId: null,
    exitCode: null,
    endedAt: null,
  };
  let relocatingRunId = null;

  const SEARXNG_CONTAINER_NAME = 'spec-harvester-searxng';
  const SEARXNG_DEFAULT_BASE_URL = String(config?.searxngDefaultBaseUrl || 'http://127.0.0.1:8080').trim() || 'http://127.0.0.1:8080';
  const SEARXNG_COMPOSE_PATH = resolveProjectPath(path.join('tools', 'searxng', 'docker-compose.yml'));

  function isProcessRunning() {
    return Boolean(childProc && childProc.exitCode === null);
  }

  function processStatus() {
    const running = isProcessRunning();
    const active = running ? childProc : null;
    const runId = normalizeRunIdToken(active?._runId || lastProcessSnapshot.runId || relocatingRunId || '');
    return {
      running,
      relocating: Boolean(relocatingRunId),
      relocatingRunId: relocatingRunId || null,
      run_id: runId || null,
      runId: runId || null,
      pid: active?.pid || lastProcessSnapshot.pid || null,
      command: active?._cmd || lastProcessSnapshot.command || null,
      startedAt: active?._startedAt || lastProcessSnapshot.startedAt || null,
      exitCode: running ? null : (lastProcessSnapshot.exitCode ?? null),
      endedAt: running ? null : (lastProcessSnapshot.endedAt || null),
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeoutFn(resolve, Math.max(0, Number(ms || 0))));
  }

  function runCommandCapture(command, args = [], options = {}) {
    const timeoutMs = Math.max(1_000, Number.parseInt(String(options.timeoutMs || 20_000), 10) || 20_000);
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let proc = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      try {
        proc = spawn(command, args, {
          cwd: options.cwd || path.resolve('.'),
          env: options.env || processRef.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        finish({
          ok: false,
          code: null,
          stdout,
          stderr,
          error: error?.message || String(error || ''),
        });
        return;
      }

      const timer = setTimeoutFn(() => {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        finish({
          ok: false,
          code: null,
          stdout,
          stderr: `${stderr}\ncommand_timeout`.trim(),
          error: 'command_timeout',
        });
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      proc.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      proc.on('error', (error) => {
        clearTimeoutFn(timer);
        finish({
          ok: false,
          code: null,
          stdout,
          stderr,
          error: error?.message || String(error || ''),
        });
      });
      proc.on('exit', (code) => {
        clearTimeoutFn(timer);
        finish({
          ok: code === 0,
          code: Number.isFinite(code) ? code : null,
          stdout,
          stderr,
        });
      });
    });
  }

  async function probeSearxngHttp(baseUrl) {
    const normalizedBase = normalizeUrlToken(baseUrl, SEARXNG_DEFAULT_BASE_URL);
    if (typeof fetchImpl !== 'function') {
      return {
        ok: false,
        status: 0,
        error: 'fetch_unavailable',
      };
    }
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), 4_000);
    try {
      const probe = new URL('/search', `${normalizedBase}/`);
      probe.searchParams.set('q', 'health');
      probe.searchParams.set('format', 'json');
      probe.searchParams.set('language', 'en');
      probe.searchParams.set('safesearch', '0');
      const response = await fetchImpl(probe, { signal: controller.signal });
      return {
        ok: response.ok,
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error?.message || String(error || ''),
      };
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function getSearxngStatus() {
    const baseUrl = normalizeUrlToken(config.searxngBaseUrl || processRef.env.SEARXNG_BASE_URL || '', SEARXNG_DEFAULT_BASE_URL);
    const composeFileExists = fsSync.existsSync(SEARXNG_COMPOSE_PATH);
    const dockerVersion = await runCommandCapture('docker', ['--version'], { timeoutMs: 6_000 });
    const dockerAvailable = dockerVersion.ok;

    let running = false;
    let statusText = '';
    let portsText = '';
    let containerFound = false;
    let dockerPsError = '';

    if (dockerAvailable) {
      const ps = await runCommandCapture(
        'docker',
        ['ps', '-a', '--filter', `name=${SEARXNG_CONTAINER_NAME}`, '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'],
        { timeoutMs: 10_000 },
      );
      if (ps.ok) {
        const first = String(ps.stdout || '')
          .split(/\r?\n/)
          .map((row) => row.trim())
          .find(Boolean) || '';
        if (first) {
          containerFound = true;
          const parts = first.split('\t');
          statusText = String(parts[1] || '').trim();
          portsText = String(parts[2] || '').trim();
          running = /^up\b/i.test(statusText);
        }
      } else {
        dockerPsError = String(ps.stderr || ps.error || '').trim();
      }
    }

    const httpProbe = running ? await probeSearxngHttp(baseUrl) : { ok: false, status: 0 };
    const httpReady = Boolean(httpProbe.ok);
    const canStart = dockerAvailable && composeFileExists;
    const needsStart = !running;

    let message = '';
    if (!dockerAvailable) {
      message = 'docker_not_available';
    } else if (!composeFileExists) {
      message = 'compose_file_missing';
    } else if (needsStart) {
      message = 'stopped';
    } else if (!httpReady) {
      message = 'container_running_http_unready';
    } else {
      message = 'ready';
    }

    return {
      container_name: SEARXNG_CONTAINER_NAME,
      compose_path: SEARXNG_COMPOSE_PATH,
      compose_file_exists: composeFileExists,
      base_url: baseUrl,
      docker_available: dockerAvailable,
      container_found: containerFound,
      running,
      status: statusText || (running ? 'Up' : 'Not running'),
      ports: portsText || '',
      http_ready: httpReady,
      http_status: Number(httpProbe.status || 0),
      can_start: canStart,
      needs_start: needsStart,
      message,
      docker_error: dockerPsError || undefined,
      http_error: httpProbe?.error || undefined,
    };
  }

  async function startSearxngStack() {
    const composeFileExists = fsSync.existsSync(SEARXNG_COMPOSE_PATH);
    if (!composeFileExists) {
      return {
        ok: false,
        error: 'compose_file_missing',
        status: await getSearxngStatus(),
      };
    }

    const up = await runCommandCapture(
      'docker',
      ['compose', '-f', SEARXNG_COMPOSE_PATH, 'up', '-d'],
      { timeoutMs: 60_000 },
    );
    if (!up.ok) {
      return {
        ok: false,
        error: String(up.stderr || up.error || 'docker_compose_up_failed').trim(),
        status: await getSearxngStatus(),
      };
    }

    for (let i = 0; i < 10; i += 1) {
      const status = await getSearxngStatus();
      if (status.http_ready || status.running) {
        return {
          ok: true,
          started: true,
          compose_stdout: String(up.stdout || '').trim(),
          status,
        };
      }
      await sleep(800);
    }

    return {
      ok: true,
      started: true,
      compose_stdout: String(up.stdout || '').trim(),
      status: await getSearxngStatus(),
    };
  }

  function startProcess(cmd, cliArgs, envOverrides = {}) {
    if (isProcessRunning()) {
      throw new Error('process_already_running');
    }
    const runId = extractRunIdFromCliArgs(cliArgs);
    childLog = [];
    const runtimeEnv = {
      ...processRef.env,
      LOCAL_MODE: 'true',
    };
    for (const [key, value] of Object.entries(envOverrides || {})) {
      if (!key) continue;
      if (value === undefined || value === null || value === '') continue;
      runtimeEnv[String(key)] = String(value);
    }
    const child = spawn('node', [cmd, ...cliArgs], {
      cwd: path.resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: runtimeEnv,
    });
    child._cmd = `node ${cmd} ${cliArgs.join(' ')}`;
    child._startedAt = new Date().toISOString();
    child._runId = runId || null;
    lastProcessSnapshot = {
      pid: child.pid || null,
      command: child._cmd,
      startedAt: child._startedAt,
      runId: child._runId || null,
      exitCode: null,
      endedAt: null,
    };
    child.stdout.on('data', (d) => {
      const lines = d.toString().split('\n').filter(Boolean);
      childLog.push(...lines);
      if (childLog.length > MAX_LOG) childLog.splice(0, childLog.length - MAX_LOG);
      broadcastWs('process', lines);
    });
    child.stderr.on('data', (d) => {
      const lines = d.toString().split('\n').filter(Boolean);
      childLog.push(...lines);
      if (childLog.length > MAX_LOG) childLog.splice(0, childLog.length - MAX_LOG);
      broadcastWs('process', lines);
    });
    child.on('exit', (code, signal) => {
      const resolvedExitCode = Number.isFinite(code) ? code : null;
      const resolvedSignal = String(signal || '').trim();
      broadcastWs(
        'process',
        [`[process exited with code ${resolvedExitCode === null ? 'null' : resolvedExitCode}${resolvedSignal ? ` signal ${resolvedSignal}` : ''}]`],
      );
      lastProcessSnapshot = {
        ...lastProcessSnapshot,
        pid: child.pid || lastProcessSnapshot.pid,
        command: child._cmd || lastProcessSnapshot.command,
        startedAt: child._startedAt || lastProcessSnapshot.startedAt,
        runId: child._runId || lastProcessSnapshot.runId || null,
        exitCode: resolvedExitCode,
        endedAt: new Date().toISOString(),
      };
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
          relocatingRunId = child._runId || 'unknown';
          broadcastWs('process-status', processStatus());
          try {
            await handleIndexLabProcessCompletion({
              exitCode: resolvedExitCode,
              cliArgs,
              startedAt: child._startedAt || '',
              runDataStorageSettings: runDataStorageState,
              indexLabRoot: indexLabRoot,
              outputRoot: outputRoot,
              outputPrefix,
              broadcastWs,
            });
          } finally {
            relocatingRunId = null;
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

  function killWindowsProcessTree(pid) {
    const safePid = Number.parseInt(String(pid || ''), 10);
    if (!Number.isFinite(safePid) || safePid <= 0 || processRef.platform !== 'win32') {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      execCb(`taskkill /PID ${safePid} /T /F`, (error) => {
        resolve(!error);
      });
    });
  }

  async function findOrphanIndexLabPids() {
    if (processRef.platform === 'win32') {
      const psScript = [
        "$ErrorActionPreference='SilentlyContinue'",
        'Get-CimInstance Win32_Process',
        '| Where-Object {',
        '  (',
        "    $_.Name -match '^(node|node\\.exe|cmd\\.exe|powershell\\.exe|pwsh\\.exe)$'",
        '  )',
        '  -and $_.CommandLine',
        '  -and (',
        "    $_.CommandLine -match 'src[\\\\/]cli[\\\\/](spec|indexlab)\\.js'",
        '  )',
        '  -and (',
        "    $_.CommandLine -match '\\bindexlab\\b'",
        "    -or $_.CommandLine -match '--mode\\s+indexlab'",
        "    -or $_.CommandLine -match '--local'",
        '  )',
        '}',
        '| Select-Object -ExpandProperty ProcessId',
      ].join(' ');
      const listed = await runCommandCapture(
        'powershell',
        ['-NoProfile', '-Command', psScript],
        { timeoutMs: 8_000 },
      );
      if (!listed.ok && !String(listed.stdout || '').trim()) return [];
      return parsePidRows(listed.stdout);
    }

    const listed = await runCommandCapture(
      'sh',
      ['-lc', "ps -eo pid=,args= | grep -E \"(node|sh|bash).*(src/cli/(spec|indexlab)\\.js).*(indexlab|--mode indexlab|--local)\" | grep -v grep | awk '{print $1}'"],
      { timeoutMs: 8_000 },
    );
    if (!listed.ok && !String(listed.stdout || '').trim()) return [];
    return parsePidRows(listed.stdout);
  }

  async function stopOrphanIndexLabProcesses(timeoutMs = 8000) {
    const currentPid = Number.parseInt(String(childProc?.pid || 0), 10);
    const targets = (await findOrphanIndexLabPids())
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
        ok = await killWindowsProcessTree(pid);
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
      const orphanStop = await stopOrphanIndexLabProcesses(timeoutMs);
      const status = {
        ...processStatus(),
        stop_attempted: Boolean(orphanStop.attempted || force),
        stop_confirmed: true,
        orphan_killed: orphanStop.killed,
      };
      broadcastWs('process-status', status);
      return status;
    }

    try { runningProc.kill('SIGTERM'); } catch { /* ignore */ }
    let exited = await waitForProcessExit(runningProc, Math.min(3000, timeoutMs));

    if (!exited && runningProc.exitCode === null) {
      try { runningProc.kill('SIGKILL'); } catch { /* ignore */ }
      exited = await waitForProcessExit(runningProc, 2000);
    }

    if (!exited && runningProc.exitCode === null) {
      await killWindowsProcessTree(runningProc.pid);
      exited = await waitForProcessExit(runningProc, Math.max(1000, timeoutMs - 5000));
    }
    let orphanKilled = 0;
    if (!exited && runningProc.exitCode === null) {
      const orphanStop = await stopOrphanIndexLabProcesses(timeoutMs);
      orphanKilled = orphanStop.killed;
      if (orphanStop.killed > 0) {
        exited = true;
      }
    }
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
