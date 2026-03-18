#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TARGET_PORT = 8788;
const PS_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 20_000;
const PROCESS_EXIT_TIMEOUT_MS = 10_000;
const STATE_DIRNAME = '.server-state';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const AGENT_MARKERS = Object.freeze(['claude', 'codex']);
const SPEC_FACTORY_MARKERS = Object.freeze([
  'specfactory.exe',
  'src\\api\\guiserver.js',
  'tools\\dev-stack-control.js',
  'tools\\gui-launcher.mjs',
]);
const CLI_ACTIONS = Object.freeze(['state', 'kill', 'restart']);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePathLike(value) {
  return normalizeText(value).toLowerCase().replace(/\//g, '\\');
}

function normalizePid(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasMarker(haystack, markers) {
  const normalized = normalizePathLike(haystack);
  return markers.some((marker) => normalized.includes(marker));
}

function isProtectedAgentProcess(detail = {}) {
  const combined = [
    detail.name,
    detail.commandLine,
    detail.executablePath,
  ].map(normalizeText).join('\n');
  return hasMarker(combined, AGENT_MARKERS);
}

function isSpecFactoryProcess(detail = {}, root = process.cwd()) {
  const combined = [
    detail.name,
    detail.commandLine,
    detail.executablePath,
  ].map(normalizeText).join('\n');
  if (hasMarker(combined, SPEC_FACTORY_MARKERS)) {
    return true;
  }
  const normalizedRoot = normalizePathLike(root);
  const normalizedCommand = normalizePathLike(detail.commandLine);
  const normalizedExecutable = normalizePathLike(detail.executablePath);
  if (!normalizedRoot) {
    return false;
  }
  return (
    normalizedExecutable === `${normalizedRoot}\\specfactory.exe` ||
    normalizedExecutable === `${normalizedRoot}\\launcher.exe` ||
    normalizedCommand.includes(`${normalizedRoot}\\00_startguiapi.bat`)
  );
}

function deriveRestartStrategy(row = {}) {
  if (row.protected_process) {
    return null;
  }
  const normalizedName = normalizePathLike(row.name);
  const normalizedCommand = normalizePathLike(row.commandLine);
  if (normalizedName === 'specfactory.exe' || normalizedCommand.includes('specfactory.exe')) {
    return 'start-exe';
  }
  if (row.roles.includes('tracked_api')) {
    return 'start-api';
  }
  if (normalizedCommand.includes('src\\api\\guiserver.js')) {
    return 'start-api';
  }
  if (row.port_8788_owner && row.spec_factory_process) {
    return 'start-api';
  }
  return null;
}

function deriveActionBlockReason({
  running,
  protectedProcess,
  specFactoryProcess,
}) {
  if (!running) {
    return 'not_running';
  }
  if (protectedProcess) {
    return 'protected_agent_runtime';
  }
  if (!specFactoryProcess) {
    return 'not_spec_factory_process';
  }
  return null;
}

function sortRows(left, right) {
  const leftScore =
    (left.port_8788_owner ? 100 : 0) +
    (left.roles.includes('tracked_api') ? 40 : 0) +
    (left.roles.includes('tracked_gui') ? 20 : 0) +
    (left.spec_factory_process ? 10 : 0) +
    (left.running ? 5 : 0);
  const rightScore =
    (right.port_8788_owner ? 100 : 0) +
    (right.roles.includes('tracked_api') ? 40 : 0) +
    (right.roles.includes('tracked_gui') ? 20 : 0) +
    (right.spec_factory_process ? 10 : 0) +
    (right.running ? 5 : 0);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return (left.pid || 0) - (right.pid || 0);
}

export function buildProcessRows({
  root = process.cwd(),
  tracked = {},
  portOwnerPids = [],
  details = [],
} = {}) {
  const detailMap = new Map();
  for (const detail of toArray(details)) {
    const pid = normalizePid(detail?.pid);
    if (!pid) {
      continue;
    }
    detailMap.set(pid, {
      pid,
      name: normalizeText(detail?.name) || 'unknown',
      commandLine: normalizeText(detail?.commandLine),
      executablePath: normalizeText(detail?.executablePath),
      parentPid: normalizePid(detail?.parentPid),
      createdAt: normalizeText(detail?.createdAt),
    });
  }

  const pids = new Set([
    ...detailMap.keys(),
    ...toArray(portOwnerPids).map(normalizePid).filter(Boolean),
    normalizePid(tracked?.api),
    normalizePid(tracked?.gui),
  ].filter(Boolean));

  const normalizedPortOwnerPids = toArray(portOwnerPids).map(normalizePid).filter(Boolean);
  const rows = [];
  for (const pid of pids) {
    const detail = detailMap.get(pid) || {
      pid,
      name: 'unknown',
      commandLine: '',
      executablePath: '',
      parentPid: null,
      createdAt: '',
    };
    const roles = [];
    if (normalizePid(tracked?.api) === pid) {
      roles.push('tracked_api');
    }
    if (normalizePid(tracked?.gui) === pid) {
      roles.push('tracked_gui');
    }
    if (normalizedPortOwnerPids.includes(pid)) {
      roles.push('port_8788_owner');
    }

    const running = detailMap.has(pid);
    const protectedProcess = isProtectedAgentProcess(detail);
    const specFactoryProcess = isSpecFactoryProcess(detail, root);
    if (specFactoryProcess) {
      roles.push('repo_process');
    }

    const actionBlockReason = deriveActionBlockReason({
      running,
      protectedProcess,
      specFactoryProcess,
    });
    const restartStrategy = deriveRestartStrategy({
      ...detail,
      roles,
      port_8788_owner: roles.includes('port_8788_owner'),
      protected_process: protectedProcess,
      spec_factory_process: specFactoryProcess,
    });

    rows.push({
      pid,
      name: detail.name,
      commandLine: detail.commandLine,
      executablePath: detail.executablePath,
      parentPid: detail.parentPid,
      createdAt: detail.createdAt,
      running,
      roles,
      port_8788_owner: roles.includes('port_8788_owner'),
      tracked_api: roles.includes('tracked_api'),
      tracked_gui: roles.includes('tracked_gui'),
      protected_process: protectedProcess,
      spec_factory_process: specFactoryProcess,
      action_block_reason: actionBlockReason,
      can_kill: actionBlockReason === null,
      restart_strategy: actionBlockReason === null ? restartStrategy : null,
      can_restart: actionBlockReason === null && Boolean(restartStrategy),
    });
  }

  return rows.sort(sortRows);
}

export function buildRestartPlan({ root = process.cwd(), row } = {}) {
  if (!row || !row.can_restart) {
    return null;
  }
  if (row.restart_strategy === 'start-api') {
    return {
      strategy: 'start-api',
      command: process.execPath,
      args: [path.join(root, 'tools', 'dev-stack-control.js'), 'start-api'],
      cwd: root,
    };
  }
  if (row.restart_strategy === 'start-exe') {
    const executablePath = normalizeText(row.executablePath) || path.join(root, 'SpecFactory.exe');
    return {
      strategy: 'start-exe',
      command: executablePath,
      args: [],
      cwd: root,
    };
  }
  return null;
}

function readTrackedPid(pidFile) {
  try {
    const raw = readFileSync(pidFile, 'utf8').trim();
    return normalizePid(raw);
  } catch {
    return null;
  }
}

function getTrackedState(root) {
  const stateDir = path.join(root, STATE_DIRNAME);
  return {
    api: readTrackedPid(path.join(stateDir, 'spec-factory-api.pid')),
    gui: readTrackedPid(path.join(stateDir, 'spec-factory-gui.pid')),
  };
}

function toPowerShellString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function runProcess(command, args = [], {
  cwd = process.cwd(),
  timeoutMs = ACTION_TIMEOUT_MS,
  detached = false,
  windowsHide = true,
} = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child = null;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    try {
      child = spawn(command, args, {
        cwd,
        detached,
        windowsHide,
        stdio: detached ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error?.message || String(error || ''),
        pid: null,
      });
      return;
    }

    if (detached) {
      child.unref();
      finish({
        ok: true,
        code: 0,
        stdout: '',
        stderr: '',
        pid: child.pid || null,
      });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore timeout cleanup failures.
      }
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\ncommand_timeout`.trim(),
        error: 'command_timeout',
        pid: child.pid || null,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error?.message || String(error || ''),
        pid: child?.pid || null,
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code: Number.isFinite(code) ? code : null,
        stdout,
        stderr,
        pid: child?.pid || null,
      });
    });
  });
}

function runPowerShellJson(script, { timeoutMs = PS_TIMEOUT_MS } = {}) {
  const encoded = Buffer.from(String(script || ''), 'utf16le').toString('base64');
  return runProcess(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeoutMs },
  ).then((result) => {
    if (!result.ok) {
      throw new Error(result.error || result.stderr || 'powershell_failed');
    }
    const stdout = normalizeText(result.stdout);
    if (!stdout) {
      return {};
    }
    return JSON.parse(stdout);
  });
}

async function queryProcessSnapshot(root, targetPort = TARGET_PORT) {
  const script = `
$ErrorActionPreference = 'Stop'
$root = ${toPowerShellString(root)}
$targetPort = ${Number(targetPort) || TARGET_PORT}
$lowerRoot = $root.ToLowerInvariant()
$portPids = @()
try {
  $portPids = @(Get-NetTCPConnection -State Listen -LocalPort $targetPort -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
} catch {
  $netstatLines = @(netstat -ano -p tcp | Select-String ":$targetPort")
  foreach ($match in $netstatLines) {
    $line = [string]$match.Line
    if (-not $line.ToUpperInvariant().Contains('LISTENING')) { continue }
    $parts = $line.Trim() -split '\\s+'
    if ($parts.Length -lt 5) { continue }
    $pid = 0
    if ([int]::TryParse($parts[$parts.Length - 1], [ref]$pid) -and $pid -gt 0) {
      $portPids += $pid
    }
  }
  $portPids = @($portPids | Select-Object -Unique)
}
$details = @(Get-CimInstance Win32_Process | Where-Object {
  $cmd = [string]$_.CommandLine
  $exe = [string]$_.ExecutablePath
  $name = [string]$_.Name
  $commandMatchesRoot = $cmd -and $cmd.ToLowerInvariant().Contains($lowerRoot)
  $exeMatchesRoot = $exe -and $exe.ToLowerInvariant().Contains($lowerRoot)
  $isSpecExe = $name -ieq 'SpecFactory.exe'
  $isGuiServer = $cmd -match 'guiServer\\.js'
  $portPids -contains $_.ProcessId -or $commandMatchesRoot -or $exeMatchesRoot -or $isSpecExe -or $isGuiServer
} | ForEach-Object {
  $createdAt = ''
  if ($_.CreationDate) {
    try {
      $createdAt = [Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate).ToString('o')
    } catch {
      $createdAt = ''
    }
  }
  [PSCustomObject]@{
    pid = [int]$_.ProcessId
    name = [string]$_.Name
    commandLine = [string]$_.CommandLine
    executablePath = [string]$_.ExecutablePath
    parentPid = [int]$_.ParentProcessId
    createdAt = $createdAt
  }
})
[PSCustomObject]@{
  portOwnerPids = @($portPids | Select-Object -Unique)
  details = $details
} | ConvertTo-Json -Depth 5 -Compress
`;
  const snapshot = await runPowerShellJson(script);
  return {
    portOwnerPids: toArray(snapshot?.portOwnerPids).map(normalizePid).filter(Boolean),
    details: toArray(snapshot?.details),
  };
}

function isPidRunning(pid) {
  if (!normalizePid(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs = PROCESS_EXIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !isPidRunning(pid);
}

export async function getManagerState({
  root = process.cwd(),
  targetPort = TARGET_PORT,
} = {}) {
  const tracked = getTrackedState(root);
  const snapshot = await queryProcessSnapshot(root, targetPort);
  return {
    ok: true,
    root,
    targetPort,
    tracked,
    rows: buildProcessRows({
      root,
      tracked,
      portOwnerPids: snapshot.portOwnerPids,
      details: snapshot.details,
    }),
    updatedAt: new Date().toISOString(),
  };
}

async function resolveActionRow({ root, targetPort, pid }) {
  const state = await getManagerState({ root, targetPort });
  const row = state.rows.find((entry) => entry.pid === pid) || null;
  return { state, row };
}

export async function killManagedProcess({
  root = process.cwd(),
  targetPort = TARGET_PORT,
  pid,
} = {}) {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) {
    return {
      ok: false,
      error: 'invalid_pid',
    };
  }
  const { row } = await resolveActionRow({ root, targetPort, pid: normalizedPid });
  if (!row) {
    return {
      ok: false,
      error: 'pid_not_found',
    };
  }
  if (!row.can_kill) {
    return {
      ok: false,
      error: row.action_block_reason || 'kill_not_allowed',
      row,
    };
  }

  const result = await runProcess('taskkill.exe', ['/PID', String(normalizedPid), '/T', '/F'], {
    timeoutMs: ACTION_TIMEOUT_MS,
  });
  const exited = await waitForProcessExit(normalizedPid);
  if (!result.ok || !exited) {
    return {
      ok: false,
      error: result.error || result.stderr || 'taskkill_failed',
      row,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  return {
    ok: true,
    pid: normalizedPid,
    row,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function restartManagedProcess({
  root = process.cwd(),
  targetPort = TARGET_PORT,
  pid,
} = {}) {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) {
    return {
      ok: false,
      error: 'invalid_pid',
    };
  }
  const { row } = await resolveActionRow({ root, targetPort, pid: normalizedPid });
  if (!row) {
    return {
      ok: false,
      error: 'pid_not_found',
    };
  }
  if (!row.can_restart) {
    return {
      ok: false,
      error: row.action_block_reason || 'restart_not_allowed',
      row,
    };
  }

  if (row.running && row.can_kill) {
    const killResult = await killManagedProcess({ root, targetPort, pid: normalizedPid });
    if (!killResult.ok) {
      return killResult;
    }
  }

  const plan = buildRestartPlan({ root, row });
  if (!plan) {
    return {
      ok: false,
      error: 'restart_plan_missing',
      row,
    };
  }
  const startResult = await runProcess(plan.command, plan.args, {
    cwd: plan.cwd,
    detached: true,
  });
  if (!startResult.ok) {
    return {
      ok: false,
      error: startResult.error || 'restart_spawn_failed',
      row,
    };
  }
  return {
    ok: true,
    pid: normalizedPid,
    row,
    plan,
    spawnedPid: startResult.pid,
  };
}

function createCliError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function parseCliRequest(argv = process.argv.slice(2)) {
  const args = toArray(argv).map((entry) => normalizeText(entry));
  const action = normalizeText(args[0]).toLowerCase();
  if (!CLI_ACTIONS.includes(action)) {
    throw createCliError('invalid_action');
  }

  let pid = null;
  let index = 1;
  while (index < args.length) {
    const token = args[index];
    if (token === '--json') {
      index += 1;
      continue;
    }
    if (token === '--pid') {
      if (args[index + 1] === undefined) {
        throw createCliError('missing_pid');
      }
      const candidate = normalizePid(args[index + 1]);
      if (!candidate) {
        throw createCliError('invalid_pid');
      }
      pid = candidate;
      index += 2;
      continue;
    }
    throw createCliError('unknown_argument');
  }

  if (action !== 'state' && !pid) {
    throw createCliError('missing_pid');
  }

  return {
    action,
    pid: action === 'state' ? null : pid,
    json: true,
  };
}

export async function runCliRequest({
  request,
  root = DEFAULT_ROOT,
  targetPort = TARGET_PORT,
} = {}) {
  if (!request?.action) {
    throw createCliError('missing_request');
  }
  if (request.action === 'state') {
    return getManagerState({ root, targetPort });
  }
  if (request.action === 'kill') {
    return killManagedProcess({ root, targetPort, pid: request.pid });
  }
  if (request.action === 'restart') {
    return restartManagedProcess({ root, targetPort, pid: request.pid });
  }
  throw createCliError('invalid_action');
}

function writeCliPayload(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(argv = process.argv.slice(2)) {
  const request = parseCliRequest(argv);
  const result = await runCliRequest({
    request,
    root: DEFAULT_ROOT,
    targetPort: TARGET_PORT,
  });
  writeCliPayload(result);
  if (result?.ok === false) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isMain) {
  void main().catch((error) => {
    writeCliPayload({
      ok: false,
      error: error?.code || error?.message || String(error || 'process_manager_failed'),
    });
    process.exitCode = 1;
  });
}
