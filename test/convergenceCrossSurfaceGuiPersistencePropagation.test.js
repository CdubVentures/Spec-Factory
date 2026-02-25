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

const CATEGORY = 'mouse_convergence_cross_surface_gui';

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

async function seedCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
}

async function ensureDetailsOpen(page, summaryText) {
  const details = page.locator(`details:has(summary:has-text("${summaryText}"))`).first();
  await details.waitFor({ state: 'attached', timeout: 25_000 });
  const isOpen = await details.evaluate((node) => node.hasAttribute('open'));
  if (isOpen) return details;
  await details.locator('summary').first().click();
  await waitForCondition(
    async () => await details.evaluate((node) => node.hasAttribute('open')),
    10_000,
    120,
    `details_open_${summaryText}`,
  );
  return details;
}

test('GUI convergence knob stays synced across Pipeline Settings and Runtime Panel and persists reload', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'convergence-cross-surface-gui-'));
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

    const serpTriageCard = page.locator('h3:has-text("SERP Triage")').locator('xpath=ancestor::div[contains(@class,"rounded")][1]').first();
    await serpTriageCard.waitFor({ state: 'visible', timeout: 20_000 });
    const triagePipelineCheckbox = serpTriageCard.locator('label:has-text("Triage Enabled") input[type="checkbox"]').first();
    await triagePipelineCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    const targetFromPipeline = !(await triagePipelineCheckbox.isChecked());
    if ((await triagePipelineCheckbox.isChecked()) !== targetFromPipeline) {
      await triagePipelineCheckbox.click();
    }

    const pipelineSave = page.getByRole('button', { name: 'Save Settings', exact: true }).first();
    await pipelineSave.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => !(await pipelineSave.isDisabled()),
      20_000,
      120,
      'pipeline_convergence_save_enabled',
    );
    await pipelineSave.click();

    await waitForCondition(async () => {
      const payload = await apiJson(baseUrl, 'GET', '/convergence-settings');
      return payload?.serpTriageEnabled === targetFromPipeline;
    }, 25_000, 150, 'pipeline_convergence_persisted');

    await page.getByRole('link', { name: 'Indexing Lab' }).click();
    await page.waitForURL(/#\/indexing/, { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await ensureDetailsOpen(page, 'Run Setup and Discovery');
    const runtimeConvergence = await ensureDetailsOpen(page, 'Convergence Tuning');
    const triageRuntimeCheckbox = runtimeConvergence.locator('label:has-text("Triage Enabled") input[type="checkbox"]').first();
    await triageRuntimeCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await triageRuntimeCheckbox.isChecked(),
      targetFromPipeline,
      'runtime panel convergence knob should reflect pipeline settings saved value',
    );

    const targetFromRuntime = !targetFromPipeline;
    if ((await triageRuntimeCheckbox.isChecked()) !== targetFromRuntime) {
      await triageRuntimeCheckbox.click();
    }
    const runtimeSave = runtimeConvergence.getByRole('button', { name: 'Save', exact: true }).first();
    await runtimeSave.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => !(await runtimeSave.isDisabled()),
      20_000,
      120,
      'runtime_convergence_save_enabled',
    );
    await runtimeSave.click();

    await waitForCondition(async () => {
      const payload = await apiJson(baseUrl, 'GET', '/convergence-settings');
      return payload?.serpTriageEnabled === targetFromRuntime;
    }, 25_000, 150, 'runtime_convergence_persisted');

    await page.getByRole('link', { name: 'Pipeline Settings' }).click();
    await page.waitForURL(/#\/pipeline-settings/, { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    const triagePipelineAfterRuntimeSave = page
      .locator('h3:has-text("SERP Triage")')
      .locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
      .first()
      .locator('label:has-text("Triage Enabled") input[type="checkbox"]')
      .first();
    await triagePipelineAfterRuntimeSave.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await triagePipelineAfterRuntimeSave.isChecked(),
      targetFromRuntime,
      'pipeline convergence knob should reflect runtime panel saved value',
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    const triageAfterReload = page
      .locator('h3:has-text("SERP Triage")')
      .locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
      .first()
      .locator('label:has-text("Triage Enabled") input[type="checkbox"]')
      .first();
    await triageAfterReload.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await triageAfterReload.isChecked(),
      targetFromRuntime,
      'convergence knob should remain persisted after reload',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[convergenceCrossSurfaceGuiPersistencePropagation logs]\n', capturedLogs);
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

