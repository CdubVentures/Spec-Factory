import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  seedFieldRules,
  seedComponentDb,
  seedKnownValues,
  seedWorkbookMap,
  findFreePort,
  waitForServerReady,
  stopProcess,
} from '../../../../test/fixtures/reviewLaneFixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

async function ensureGuiBuilt() {
  const distIndex = path.join(REPO_ROOT, 'tools', 'gui-react', 'dist', 'index.html');
  try {
    await fs.access(distIndex);
  } catch {
    throw new Error(`gui_dist_missing:${distIndex}`);
  }
}

async function waitForCondition(predicate, timeoutMs = 20_000, intervalMs = 150, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await predicate();
    if (ok) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout_waiting_for_condition:${label}`);
}

async function seedCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
}

async function readRootThemeState(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-sf-theme'),
    mode: document.documentElement.getAttribute('data-sf-theme-mode'),
    radius: document.documentElement.getAttribute('data-sf-radius'),
    density: document.documentElement.getAttribute('data-sf-density'),
    darkClass: document.documentElement.classList.contains('dark'),
    storedTheme: localStorage.getItem('ui:themeColorProfile'),
    storedRadius: localStorage.getItem('ui:themeRadiusProfile'),
  }));
}

test('app-shell appearance controls hydrate persisted theme profile and persist runtime changes', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-profile-gui-'));
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const localOutputRoot = path.join(tempRoot, 'out');
  const guiDistRoot = path.join(REPO_ROOT, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  const logs = [];

  try {
    await ensureGuiBuilt();
    await seedCategory(categoryAuthorityRoot, 'mouse');

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.join(REPO_ROOT, 'src', 'api', 'guiServer.js');
    child = spawn('node', [guiServerPath, '--port', String(port), '--local'], {
      cwd: tempRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: categoryAuthorityRoot,
        LOCAL_OUTPUT_ROOT: localOutputRoot,
        LOCAL_INPUT_ROOT: path.join(tempRoot, 'fixtures'),
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
        __GUI_DIST_ROOT: guiDistRoot,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    await waitForServerReady(baseUrl, child);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript(() => {
      if (!localStorage.getItem('ui:themeColorProfile')) {
        localStorage.setItem('ui:themeColorProfile', 'slate');
      }
      if (!localStorage.getItem('ui:themeRadiusProfile')) {
        localStorage.setItem('ui:themeRadiusProfile', 'relaxed');
      }
      if (!localStorage.getItem('ui:themeDensityProfile')) {
        localStorage.setItem('ui:themeDensityProfile', 'standard');
      }
      if (!localStorage.getItem('ui:darkMode')) {
        localStorage.setItem('ui:darkMode', 'true');
      }
    });

    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
      await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

      await waitForCondition(async () => {
        const state = await readRootThemeState(page);
        return (
          state.theme === 'slate'
          && state.mode === 'dark'
          && state.radius === 'relaxed'
          && state.density === 'standard'
          && state.darkClass === true
        );
      }, 20_000, 150, 'persisted_theme_hydrated');

      assert.equal(await page.getByText('Appearance', { exact: true }).count(), 0, 'pipeline page should not inline appearance controls');
      assert.equal(await page.getByText('Corner Radius', { exact: true }).count(), 0, 'pipeline page should not inline radius controls');

      const openSettingsButton = page.getByRole('button', { name: /Open app settings/i }).first();
      await openSettingsButton.waitFor({ state: 'visible', timeout: 20_000 });
      await openSettingsButton.click();

      await page.getByText('Appearance', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
      await page.getByText('Theme', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
      await page.getByText('Corner Radius', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });

      await page.getByRole('button', { name: 'Sand', exact: true }).click();
      await page.getByRole('button', { name: 'Pill Heavy', exact: true }).click();

      await waitForCondition(async () => {
        const state = await readRootThemeState(page);
        return (
          state.theme === 'sand'
          && state.mode === 'light'
          && state.radius === 'pill-heavy'
          && state.darkClass === false
          && state.storedTheme === 'sand'
          && state.storedRadius === 'pill-heavy'
        );
      }, 20_000, 150, 'theme_switch_persisted');

      const closeSettingsButton = page.getByRole('button', { name: /Close app settings/i }).first();
      await closeSettingsButton.click();
      await waitForCondition(
        async () => (await page.getByText('Appearance', { exact: true }).count()) === 0,
        5_000,
        100,
        'appearance_panel_closed',
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
      await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

      await waitForCondition(async () => {
        const state = await readRootThemeState(page);
        return (
          state.theme === 'sand'
          && state.mode === 'light'
          && state.radius === 'pill-heavy'
          && state.darkClass === false
        );
      }, 20_000, 150, 'theme_persisted_after_reload');

      assert.equal(await page.getByText('Appearance', { exact: true }).count(), 0, 'appearance controls should remain owned by the app-shell drawer after reload');
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[themeProfileGuiContract logs]\n', capturedLogs);
    }
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopProcess(child);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});
