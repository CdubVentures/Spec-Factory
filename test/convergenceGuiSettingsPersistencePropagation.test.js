import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  seedFieldRules,
  seedComponentDb,
  seedKnownValues,
  seedWorkbookMap,
  findFreePort,
  waitForServerReady,
  apiJson,
  stopProcess,
} from './fixtures/reviewLaneFixtures.js';

const CATEGORY = 'mouse_convergence_settings_gui';

async function ensureGuiBuilt() {
  const distIndex = path.join(path.resolve('.'), 'tools', 'gui-react', 'dist', 'index.html');
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

async function selectCategory(page, category) {
  const categorySelect = page.locator('aside select').first();
  await waitForCondition(
    async () => (await categorySelect.locator(`option[value="${category}"]`).count()) > 0,
    20_000,
    150,
    'category_option_visible',
  );
  await categorySelect.selectOption(category);
  await waitForCondition(
    async () => (await categorySelect.inputValue()) === category,
    20_000,
    150,
    'category_selected',
  );
}

async function openConvergenceSection(page) {
  const convergenceSectionButton = page.getByRole('button', { name: /Convergence/i }).first();
  await convergenceSectionButton.waitFor({ state: 'visible', timeout: 20_000 });
  await convergenceSectionButton.click();
}

async function seedCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
}

test('GUI convergence tuning knob persists across save and reload in Pipeline Settings', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'convergence-settings-gui-'));
  const helperFilesRoot = path.join(tempRoot, 'helper_files');
  const localOutputRoot = path.join(tempRoot, 'out');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  let context = null;
  let page = null;
  const logs = [];

  try {
    await ensureGuiBuilt();
    await seedCategory(helperFilesRoot, 'mouse');
    await seedCategory(helperFilesRoot, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');
    child = spawn('node', [guiServerPath, '--port', String(port), '--local'], {
      cwd: tempRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: helperFilesRoot,
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

    await apiJson(baseUrl, 'PUT', '/convergence-settings', { serpTriageEnabled: true });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    await openConvergenceSection(page);
    const serpTriageCard = page.locator('h3:has-text("SERP Triage")').locator('xpath=ancestor::div[contains(@class,"rounded")][1]').first();
    await serpTriageCard.waitFor({ state: 'visible', timeout: 20_000 });
    const triageEnabledCheckbox = serpTriageCard.locator('label:has-text("Triage Enabled") input[type="checkbox"]').first();
    await triageEnabledCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    const targetValue = !(await triageEnabledCheckbox.isChecked());
    if ((await triageEnabledCheckbox.isChecked()) !== targetValue) {
      await triageEnabledCheckbox.click();
    }

    const convergenceSaveButton = page.getByRole('button', { name: 'Save', exact: true }).first();
    await convergenceSaveButton.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => !(await convergenceSaveButton.isDisabled()),
      20_000,
      120,
      'convergence_save_enabled',
    );
    await convergenceSaveButton.click();

    await waitForCondition(async () => {
      const payload = await apiJson(baseUrl, 'GET', '/convergence-settings');
      return payload?.serpTriageEnabled === targetValue;
    }, 25_000, 150, 'convergence_serp_triage_persisted');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    await openConvergenceSection(page);
    const triageAfterReload = page
      .locator('h3:has-text("SERP Triage")')
      .locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
      .first()
      .locator('label:has-text("Triage Enabled") input[type="checkbox"]')
      .first();
    await triageAfterReload.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await triageAfterReload.isChecked(),
      targetValue,
      'convergence triage enabled knob should persist after reload',
    );

    const persistedConvergence = await apiJson(baseUrl, 'GET', '/convergence-settings');
    assert.equal(
      persistedConvergence?.serpTriageEnabled,
      targetValue,
      'convergence settings endpoint should retain persisted triage enabled knob after reload',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[convergenceGuiSettingsPersistencePropagation logs]\n', capturedLogs);
    }
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await stopProcess(child);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});
