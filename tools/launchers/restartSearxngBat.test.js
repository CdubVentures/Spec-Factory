import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_PATH = path.join(process.cwd(), 'tools', 'launchers', 'ReStartSearXng.bat');
const COMPOSE_PATH = path.join(process.cwd(), 'tools', 'searxng', 'docker-compose.yml');
const ROOT_SHORTCUT = path.join(process.cwd(), 'Restart SearXNG.lnk');
const ICON_PATH = path.join(process.cwd(), 'tools', 'launchers', 'icons', 'restart-searxng.ico');
const OLD_ROOT_ICON = path.join(process.cwd(), 'restart-searxng.ico');

function shortcutSearchText(shortcutPath) {
  return fs.readFileSync(shortcutPath)
    .toString('latin1')
    .replace(/[^\x20-\x7e]+/g, '\n')
    .toLowerCase();
}

test('Restart SearXNG shortcut points to the moved launcher and icon', { skip: process.platform !== 'win32' }, (t) => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'expected the restart launcher to live under tools\\launchers');
  assert.equal(fs.existsSync(ROOT_SHORTCUT), true, 'expected the root shortcut to remain available');
  assert.equal(fs.existsSync(ICON_PATH), true, 'expected the icon to move under tools\\launchers\\icons');
  assert.equal(fs.existsSync(OLD_ROOT_ICON), false, 'expected the old root icon file to be removed');

  const shortcutText = shortcutSearchText(ROOT_SHORTCUT);
  assert.ok(
    shortcutText.includes(path.win32.normalize(SCRIPT_PATH).toLowerCase()),
    `expected shortcut bytes to reference ${SCRIPT_PATH}`,
  );
  assert.ok(
    shortcutText.includes('tools\\launchers\\icons\\restart-searxng.ico'),
    `expected shortcut bytes to reference the moved icon under ${ICON_PATH}`,
  );
});

test('restart-searxng.bat restarts the repo searxng compose stack', { skip: process.platform !== 'win32' }, (t) => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'expected the restart launcher to exist under tools\\launchers');

  const lines = fs.readFileSync(SCRIPT_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(
    lines.includes('for %%I in ("%SCRIPT_DIR%..\\..") do set "ROOT_DIR=%%~fI"'),
    'expected launcher to derive the repo root from tools\\launchers',
  );
  assert.ok(
    lines.includes('set "COMPOSE_FILE=%ROOT_DIR%\\tools\\searxng\\docker-compose.yml"'),
    `expected launcher to target ${COMPOSE_PATH} relative to repo root`,
  );
  assert.ok(
    lines.includes('if not exist "%COMPOSE_FILE%" ('),
    'expected launcher to fail fast when the compose file is missing',
  );

  const downIndex = lines.findIndex((line) => /^call docker compose -f "%COMPOSE_FILE%" down$/i.test(line));
  const upIndex = lines.findIndex((line) => /^call docker compose -f "%COMPOSE_FILE%" up -d$/i.test(line));
  assert.ok(downIndex >= 0, 'expected launcher to stop the repo SearXNG compose stack');
  assert.ok(upIndex >= 0, 'expected launcher to start the repo SearXNG compose stack in detached mode');
  assert.ok(downIndex < upIndex, 'expected docker compose down to run before docker compose up -d');
});
