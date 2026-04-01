import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { throwIfSpawnEperm } from '../src/shared/tests/helpers/spawnEperm.js';

import {
  buildProcessRows,
  buildRestartPlan,
  parseCliRequest,
} from './specfactory-process-manager.js';

const ROOT = 'C:\\Users\\Chris\\Desktop\\Spec Factory';
const ROOT_SHORTCUT = path.join(ROOT, 'Spec Factory Process Manager.lnk');
const ROOT_BAT = path.join(ROOT, 'OpenSpecFactoryProcessManager.bat');
const ROOT_PYW = path.join(ROOT, 'OpenSpecFactoryProcessManager.pyw');
const LAUNCHER_PYW = path.join(ROOT, 'tools', 'launchers', 'OpenSpecFactoryProcessManager.pyw');
const LAUNCHER_ICON = path.join(ROOT, 'tools', 'launchers', 'icons', 'specfactory-process-manager.ico');

function makeState({
  trackedApiPid = null,
  trackedGuiPid = null,
  portOwnerPids = [],
  details = [],
} = {}) {
  return {
    root: ROOT,
    tracked: {
      api: trackedApiPid,
      gui: trackedGuiPid,
    },
    portOwnerPids,
    details,
  };
}

function findRow(rows, pid) {
  return rows.find((row) => row.pid === pid) || null;
}

function readShortcut(shortcutPath) {
  const script = [
    '$w = New-Object -ComObject WScript.Shell',
    `$s = $w.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')`,
    '[PSCustomObject]@{',
    '  TargetPath = $s.TargetPath',
    '  IconLocation = $s.IconLocation',
    '  WorkingDirectory = $s.WorkingDirectory',
    '} | ConvertTo-Json -Compress',
  ].join('\n');

  const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  });

  throwIfSpawnEperm(run, 'PowerShell shortcut inspection must be available for this process-manager contract');
  assert.equal(run.status, 0, `expected shortcut inspection to succeed, stderr was: ${run.stderr || '(empty)'}`);
  return JSON.parse(run.stdout.trim());
}

test('buildProcessRows marks tracked API listener on 8788 as safe to kill and restart via start-api', () => {
  const rows = buildProcessRows(makeState({
    trackedApiPid: 4321,
    portOwnerPids: [4321],
    details: [
      {
        pid: 4321,
        name: 'node.exe',
        commandLine: `${path.join(ROOT, 'src', 'api', 'guiServer.js')} --port 8788 --local`,
        executablePath: 'C:\\Program Files\\nodejs\\node.exe',
        parentPid: 4000,
      },
    ],
  }));

  const row = findRow(rows, 4321);
  assert.ok(row, 'expected the tracked API pid to be present');
  assert.equal(row.port_8788_owner, true);
  assert.equal(row.can_kill, true);
  assert.equal(row.can_restart, true);
  assert.equal(row.restart_strategy, 'start-api');
  assert.equal(row.roles.includes('tracked_api'), true);
  assert.equal(row.roles.includes('port_8788_owner'), true);

  const plan = buildRestartPlan({ root: ROOT, row });
  assert.equal(plan.strategy, 'start-api');
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args.slice(0, 2), [path.join(ROOT, 'tools', 'dev-stack-control.js'), 'start-api']);
  assert.ok(plan.args.includes('--no-browser'));
  assert.equal(plan.cwd, ROOT);
});

test('buildProcessRows blocks kill and restart for protected agent runtimes even if they own 8788', () => {
  const rows = buildProcessRows(makeState({
    portOwnerPids: [5555],
    details: [
      {
        pid: 5555,
        name: 'node.exe',
        commandLine: 'C:\\Users\\Chris\\AppData\\Roaming\\npm\\codex agent --serve 8788',
        executablePath: 'C:\\Program Files\\nodejs\\node.exe',
        parentPid: 4001,
      },
    ],
  }));

  const row = findRow(rows, 5555);
  assert.ok(row, 'expected the protected runtime to be present');
  assert.equal(row.port_8788_owner, true);
  assert.equal(row.protected_process, true);
  assert.equal(row.can_kill, false);
  assert.equal(row.can_restart, false);
  assert.equal(row.action_block_reason, 'protected_agent_runtime');
});

test('buildProcessRows leaves unrelated 8788 listeners visible but not manageable', () => {
  const rows = buildProcessRows(makeState({
    portOwnerPids: [6666],
    details: [
      {
        pid: 6666,
        name: 'python.exe',
        commandLine: 'C:\\tools\\other-app\\server.py --port 8788',
        executablePath: 'C:\\Python313\\python.exe',
        parentPid: 4002,
      },
    ],
  }));

  const row = findRow(rows, 6666);
  assert.ok(row, 'expected the unrelated listener to be present');
  assert.equal(row.port_8788_owner, true);
  assert.equal(row.spec_factory_process, false);
  assert.equal(row.can_kill, false);
  assert.equal(row.can_restart, false);
  assert.equal(row.action_block_reason, 'not_spec_factory_process');
});

test('buildRestartPlan uses the executable path for SpecFactory.exe rows', () => {
  const rows = buildProcessRows(makeState({
    details: [
      {
        pid: 7777,
        name: 'SpecFactory.exe',
        commandLine: `"${path.join(ROOT, 'SpecFactory.exe')}"`,
        executablePath: path.join(ROOT, 'SpecFactory.exe'),
        parentPid: 4003,
      },
    ],
  }));

  const row = findRow(rows, 7777);
  assert.ok(row, 'expected the exe row to be present');
  assert.equal(row.can_restart, true);
  assert.equal(row.restart_strategy, 'start-exe');

  const plan = buildRestartPlan({ root: ROOT, row });
  assert.equal(plan.strategy, 'start-exe');
  assert.equal(plan.command, path.join(ROOT, 'SpecFactory.exe'));
  assert.deepEqual(plan.args, []);
  assert.equal(plan.cwd, ROOT);
});

test('buildProcessRows does not treat generic repo shells as killable app processes', () => {
  const rows = buildProcessRows(makeState({
    details: [
      {
        pid: 8888,
        name: 'cmd.exe',
        commandLine: `C:\\Windows\\System32\\cmd.exe /c cd /d "${ROOT}"`,
        executablePath: 'C:\\Windows\\System32\\cmd.exe',
        parentPid: 4004,
      },
    ],
  }));

  const row = findRow(rows, 8888);
  assert.ok(row, 'expected the repo shell row to be present');
  assert.equal(row.spec_factory_process, false);
  assert.equal(row.can_kill, false);
  assert.equal(row.can_restart, false);
  assert.equal(row.action_block_reason, 'not_spec_factory_process');
});

test('parseCliRequest accepts state without a pid and defaults to json output', () => {
  const request = parseCliRequest(['state']);

  assert.deepEqual(request, {
    action: 'state',
    pid: null,
    json: true,
  });
});

test('parseCliRequest requires a valid pid for kill and restart actions', () => {
  assert.throws(() => parseCliRequest(['kill']), /missing_pid/);
  assert.throws(() => parseCliRequest(['restart', '--pid', 'abc']), /invalid_pid/);
  assert.deepEqual(parseCliRequest(['restart', '--pid', '4321']), {
    action: 'restart',
    pid: 4321,
    json: true,
  });
});

test('process manager ships as a root shortcut with a dedicated icon and no root bat', { skip: process.platform !== 'win32' }, (t) => {
  assert.equal(fs.existsSync(ROOT_BAT), false, 'expected the old root batch launcher to be removed');
  assert.equal(fs.existsSync(ROOT_PYW), false, 'expected the root pyw launcher to be moved out of the repo root');
  assert.equal(fs.existsSync(LAUNCHER_PYW), true, 'expected the hidden python launcher to live under tools\\launchers');
  assert.equal(fs.existsSync(LAUNCHER_ICON), true, 'expected the process manager icon to live under tools\\launchers\\icons');
  assert.equal(fs.existsSync(ROOT_SHORTCUT), true, 'expected a root shortcut for the process manager');

  const shortcut = readShortcut(ROOT_SHORTCUT);
  assert.equal(path.normalize(shortcut.TargetPath), path.normalize(LAUNCHER_PYW));
  assert.equal(path.normalize(shortcut.WorkingDirectory), path.normalize(ROOT));
  assert.ok(
    shortcut.IconLocation.toLowerCase().startsWith(LAUNCHER_ICON.toLowerCase()),
    `expected the shortcut icon to come from ${LAUNCHER_ICON}, got ${shortcut.IconLocation}`,
  );
});
