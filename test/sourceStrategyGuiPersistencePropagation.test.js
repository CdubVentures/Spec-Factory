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

const CATEGORY = 'mouse_source_strategy_gui';

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

async function openSourceStrategySection(page) {
  const sourceStrategySectionButton = page.getByRole('button', { name: /Source Strategy/i }).first();
  await sourceStrategySectionButton.waitFor({ state: 'visible', timeout: 20_000 });
  await sourceStrategySectionButton.click();
}

async function seedCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
}

async function ensureSourceStrategyRow(baseUrl, category) {
  const existingRows = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(category)}`);
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    return existingRows[0];
  }
  const host = `gui-source-${Date.now()}.example.com`;
  const created = await apiJson(baseUrl, 'POST', `/source-strategy?category=${encodeURIComponent(category)}`, {
    host,
    display_name: 'GUI Source Strategy',
    source_type: 'lab_review',
    default_tier: 2,
    discovery_method: 'search_first',
    priority: 55,
    enabled: 1,
  });
  const createdId = Number(created?.id || 0);
  if (!Number.isFinite(createdId) || createdId <= 0) {
    throw new Error(`source_strategy_seed_failed:${JSON.stringify(created)}`);
  }
  const rowsAfterCreate = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(category)}`);
  const createdRow = Array.isArray(rowsAfterCreate)
    ? rowsAfterCreate.find((row) => Number(row?.id || 0) === createdId)
    : null;
  if (!createdRow) {
    throw new Error(`source_strategy_seed_row_missing:${createdId}`);
  }
  return createdRow;
}

test('GUI source strategy toggle persists across reload in pipeline settings', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'source-strategy-gui-'));
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

    const sourceRow = await ensureSourceStrategyRow(baseUrl, CATEGORY);
    const rowId = Number(sourceRow.id);
    const host = String(sourceRow.host || '');
    const targetEnabled = Number(sourceRow.enabled ? 0 : 1);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    await openSourceStrategySection(page);
    await page.waitForSelector('h3:has-text("Source Strategy")', { timeout: 20_000 });

    const rowLocator = page.locator('tr').filter({ has: page.locator(`td:has-text("${host}")`) }).first();
    await rowLocator.waitFor({ state: 'visible', timeout: 25_000 });
    const toggleButton = rowLocator.locator('button').filter({ hasText: /ON|OFF/ }).first();
    await toggleButton.waitFor({ state: 'visible', timeout: 20_000 });
    await toggleButton.click();

    await waitForCondition(async () => {
      const rows = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(CATEGORY)}`);
      const row = Array.isArray(rows) ? rows.find((entry) => Number(entry?.id || 0) === rowId) : null;
      return Number(row?.enabled || 0) === targetEnabled;
    }, 25_000, 150, 'source_strategy_toggle_persisted');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    await openSourceStrategySection(page);
    const rowAfterReload = page.locator('tr').filter({ has: page.locator(`td:has-text("${host}")`) }).first();
    await rowAfterReload.waitFor({ state: 'visible', timeout: 25_000 });
    const toggleAfterReload = rowAfterReload.locator('button').filter({ hasText: /ON|OFF/ }).first();
    await toggleAfterReload.waitFor({ state: 'visible', timeout: 20_000 });
    const expectedButtonText = targetEnabled ? 'ON' : 'OFF';
    assert.equal(
      String(await toggleAfterReload.innerText()).trim(),
      expectedButtonText,
      'source strategy toggle text should persist after reload',
    );

    const persistedRows = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(CATEGORY)}`);
    const persistedRow = Array.isArray(persistedRows)
      ? persistedRows.find((entry) => Number(entry?.id || 0) === rowId)
      : null;
    assert.equal(
      Number(persistedRow?.enabled || 0),
      targetEnabled,
      'source strategy endpoint should retain toggled enabled value after reload',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[sourceStrategyGuiPersistencePropagation logs]\n', capturedLogs);
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
