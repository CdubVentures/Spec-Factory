import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { skipIfSpawnEperm } from '../../src/shared/tests/helpers/spawnEperm.js';

const SCRIPT_PATH = path.join(process.cwd(), 'tools', 'launchers', 'ReStartSearXng.bat');
const COMPOSE_PATH = path.join(process.cwd(), 'tools', 'searxng', 'docker-compose.yml');
const ROOT_SHORTCUT = path.join(process.cwd(), 'Restart SearXNG.lnk');
const ICON_PATH = path.join(process.cwd(), 'tools', 'launchers', 'icons', 'restart-searxng.ico');
const OLD_ROOT_ICON = path.join(process.cwd(), 'restart-searxng.ico');

function readShortcut(t, shortcutPath) {
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

  if (skipIfSpawnEperm(t, run, 'sandbox blocks PowerShell shortcut inspection')) return null;
  assert.equal(run.status, 0, `expected shortcut inspection to succeed, stderr was: ${run.stderr || '(empty)'}`);
  return JSON.parse(run.stdout.trim());
}

test('Restart SearXNG shortcut points to the moved launcher and icon', { skip: process.platform !== 'win32' }, (t) => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'expected the restart launcher to live under tools\\launchers');
  assert.equal(fs.existsSync(ROOT_SHORTCUT), true, 'expected the root shortcut to remain available');
  assert.equal(fs.existsSync(ICON_PATH), true, 'expected the icon to move under tools\\launchers\\icons');
  assert.equal(fs.existsSync(OLD_ROOT_ICON), false, 'expected the old root icon file to be removed');

  const shortcut = readShortcut(t, ROOT_SHORTCUT);
  if (!shortcut) return;
  assert.equal(path.normalize(shortcut.TargetPath), path.normalize(SCRIPT_PATH));
  assert.equal(path.normalize(shortcut.WorkingDirectory), path.normalize(process.cwd()));
  assert.ok(
    shortcut.IconLocation.toLowerCase().startsWith(ICON_PATH.toLowerCase()),
    `expected the shortcut icon to come from ${ICON_PATH}, got ${shortcut.IconLocation}`,
  );
});

test('restart-searxng.bat restarts the repo searxng compose stack', { skip: process.platform !== 'win32' }, (t) => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'expected the restart launcher to exist under tools\\launchers');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-searxng-bat-'));
  const logPath = path.join(tempDir, 'docker-invocations.log');
  const fakeDockerPath = path.join(tempDir, 'docker.bat');

  fs.writeFileSync(
    fakeDockerPath,
    [
      '@echo off',
      '>> "%RESTART_SEARXNG_TEST_LOG%" echo %*',
      'exit /b 0',
      '',
    ].join('\r\n'),
    'utf8',
  );

  const run = spawnSync('cmd.exe', ['/d', '/c', SCRIPT_PATH], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${tempDir};${process.env.PATH || ''}`,
      RESTART_SEARXNG_TEST_LOG: logPath,
    },
    encoding: 'utf8',
  });

  if (skipIfSpawnEperm(t, run, 'sandbox blocks cmd launcher execution')) return;
  assert.equal(run.status, 0, `expected script to exit cleanly, stderr was: ${run.stderr || '(empty)'}`);
  assert.equal(fs.existsSync(logPath), true, 'expected fake docker to capture invocations');

  const lines = fs.readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.equal(lines.length, 2, `expected two docker compose calls, got ${lines.length}`);
  assert.match(lines[0], /\bcompose\b/i);
  assert.ok(lines[0].includes('-f'), 'expected down call to pass a compose file with -f');
  assert.match(lines[0], /tools\\searxng\\docker-compose\.yml/i);
  assert.match(lines[0], /\bdown\b/i);
  assert.ok(lines[0].includes(COMPOSE_PATH), 'expected down call to target the repo compose file');

  assert.match(lines[1], /\bcompose\b/i);
  assert.ok(lines[1].includes('-f'), 'expected up call to pass a compose file with -f');
  assert.match(lines[1], /tools\\searxng\\docker-compose\.yml/i);
  assert.match(lines[1], /\bup\b/i);
  assert.match(lines[1], /-d\b/i);
  assert.ok(lines[1].includes(COMPOSE_PATH), 'expected up call to target the repo compose file');
});
