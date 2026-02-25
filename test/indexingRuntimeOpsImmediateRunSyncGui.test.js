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

const CATEGORY = 'mouse_run_sync_gui';
const LEGACY_RUN_ID = 'run-sync-legacy-001';

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

async function seedIndexLabRun(indexLabRoot, runId, category) {
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category,
    product_id: `${category}-legacy-product`,
    started_at: '2026-02-25T00:00:00.000Z',
    ended_at: '2026-02-25T00:02:30.000Z',
    status: 'completed',
    round: 1,
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${JSON.stringify({
    run_id: runId,
    ts: '2026-02-25T00:01:00.000Z',
    event: 'fetch_started',
    payload: { url: 'https://example.com/legacy', worker_id: 'legacy-worker' },
  })}\n`, 'utf8');
}

function indexingRunSelect(page) {
  return page.locator('div[style*="order: 40"] select').first();
}

function runtimeOpsRunSelect(page) {
  return page.locator('xpath=//label[normalize-space()="Run:"]/following-sibling::select[1]').first();
}

test('GUI run start immediately syncs active run id across Indexing and RuntimeOps', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexing-runtimeops-run-sync-'));
  const helperFilesRoot = path.join(tempRoot, 'helper_files');
  const localOutputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');
  let baseUrl = '';

  let child = null;
  let browser = null;
  let context = null;
  let page = null;
  const logs = [];

  try {
    await ensureGuiBuilt();
    await seedCategory(helperFilesRoot, 'mouse');
    await seedCategory(helperFilesRoot, CATEGORY);
    await seedIndexLabRun(indexLabRoot, LEGACY_RUN_ID, CATEGORY);

    const port = await findFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');
    child = spawn('node', [guiServerPath, '--port', String(port), '--local', '--indexlab-root', indexLabRoot], {
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

    await apiJson(baseUrl, 'POST', `/catalog/${CATEGORY}/products`, {
      brand: 'SyncBrand',
      model: 'SyncModel',
      variant: 'RunSyncVariant',
      seedUrls: [],
    });
    await apiJson(baseUrl, 'PUT', '/ui-settings', { runtimeAutoSaveEnabled: false });
    await apiJson(baseUrl, 'PUT', '/runtime-settings', {
      discoveryEnabled: false,
      searchProvider: 'none',
    });
    await apiJson(baseUrl, 'POST', '/process/stop', { force: true });

    const catalogRows = await apiJson(baseUrl, 'GET', `/catalog/${CATEGORY}`);
    const addedProduct = Array.isArray(catalogRows)
      ? catalogRows.find((row) => String(row?.brand || '').trim() === 'SyncBrand' && String(row?.model || '').trim() === 'SyncModel')
      : null;
    assert.ok(addedProduct?.productId, 'seeded catalog product should be available for picker selection');
    const productId = String(addedProduct.productId);
    const productBrand = String(addedProduct.brand || 'SyncBrand').trim();
    const productModel = String(addedProduct.model || 'SyncModel').trim();

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();

    await page.goto(`${baseUrl}/#/indexing`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 25_000 });
    await selectCategory(page, CATEGORY);

    const pickerPanel = page.locator('div[style*="order: -20"]').first();
    await pickerPanel.waitFor({ state: 'visible', timeout: 25_000 });
    const toggleButton = pickerPanel.locator('button[title="Open panel"]').first();
    if ((await toggleButton.count()) > 0 && await toggleButton.isVisible().catch(() => false)) {
      await toggleButton.click();
    }

    const pickerSelects = pickerPanel.locator('select');
    const brandSelect = pickerSelects.nth(0);
    const modelSelect = pickerSelects.nth(1);
    const variantSelect = pickerSelects.nth(2);

    await waitForCondition(
      async () => (await brandSelect.locator(`option[value="${productBrand}"]`).count()) > 0,
      25_000,
      120,
      'picker_brand_option_visible',
    );
    await brandSelect.selectOption(productBrand);

    await waitForCondition(
      async () => (await modelSelect.locator(`option[value="${productModel}"]`).count()) > 0,
      25_000,
      120,
      'picker_model_option_visible',
    );
    await modelSelect.selectOption(productModel);

    await waitForCondition(
      async () => (await variantSelect.locator(`option[value="${productId}"]`).count()) > 0,
      25_000,
      120,
      'picker_variant_option_visible',
    );
    await variantSelect.selectOption(productId);

    const runButton = page.getByRole('button', { name: 'Run IndexLab', exact: true }).first();
    await runButton.waitFor({ state: 'visible', timeout: 25_000 });
    await waitForCondition(
      async () => !(await runButton.isDisabled()),
      25_000,
      120,
      'run_button_enabled',
    );

    const [startRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/v1/process/start') && res.request().method() === 'POST', { timeout: 25_000 }),
      runButton.click(),
    ]);
    const startPayload = await startRes.json();
    const startedRunId = String(startPayload?.run_id || startPayload?.runId || '').trim();
    assert.ok(startedRunId, 'process/start should return run_id');

    const indexSelect = indexingRunSelect(page);
    await waitForCondition(
      async () => (await indexSelect.inputValue()) === startedRunId,
      8_000,
      120,
      'indexing_selected_run_matches_started_run',
    );

    await page.getByRole('link', { name: 'Runtime Ops' }).click();
    await page.waitForURL(/#\/runtime-ops/, { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    const runtimeSelect = runtimeOpsRunSelect(page);
    await runtimeSelect.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => (await runtimeSelect.inputValue()) === startedRunId,
      8_000,
      120,
      'runtimeops_selected_run_matches_started_run',
    );

    const processStatus = await apiJson(baseUrl, 'GET', '/process/status');
    assert.equal(
      String(processStatus?.run_id || processStatus?.runId || '').trim(),
      startedRunId,
      'process status run id should align with started run id',
    );

    await runtimeSelect.selectOption(LEGACY_RUN_ID);
    await waitForCondition(
      async () => (await runtimeSelect.inputValue()) === LEGACY_RUN_ID,
      8_000,
      120,
      'runtimeops_manual_switch_to_legacy_run',
    );

    await page.getByRole('link', { name: 'Indexing Lab' }).click();
    await page.waitForURL(/#\/indexing/, { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    const indexSelectAfterManualSwitch = indexingRunSelect(page);
    await waitForCondition(
      async () => (await indexSelectAfterManualSwitch.inputValue()) === LEGACY_RUN_ID,
      8_000,
      120,
      'indexing_reflects_runtimeops_manual_run_switch',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[indexingRuntimeOpsImmediateRunSyncGui logs]\n', capturedLogs);
    }
    throw error;
  } finally {
    try {
      if (baseUrl && child?.exitCode === null) {
        await apiJson(baseUrl, 'POST', '/process/stop', { force: true });
      }
    } catch {
      // best effort; process teardown below handles remaining cleanup.
    }
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await stopProcess(child);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});
