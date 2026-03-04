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

const CATEGORY = 'mouse_runtime_ops_gui';
const RUN_ID = 'run-runtime-ops-gui';

const PROVIDER_LABELS = {
  google: 'Google',
  bing: 'Bing',
  searxng: 'SearXNG',
  duckduckgo: 'DuckDuckGo',
  dual: 'Dual',
  none: '',
};

const PROVIDER_MATRIX = ['google', 'bing', 'searxng', 'duckduckgo', 'dual'];

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
    product_id: `${category}-test-product`,
    started_at: '2026-02-25T00:00:00.000Z',
    ended_at: '2026-02-25T00:04:00.000Z',
    status: 'completed',
    round: 1,
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${JSON.stringify({
    run_id: runId,
    ts: '2026-02-25T00:01:00.000Z',
    event: 'fetch_started',
    payload: { url: 'https://example.com/spec', worker_id: 'worker-1' },
  })}\n`, 'utf8');
}

async function ensureRuntimeFlowRunSetup(page) {
  const runtimeFlowCard = page.locator('h3:has-text("Runtime Flow Settings")').first();
  await runtimeFlowCard.waitFor({ state: 'visible', timeout: 25_000 });
  const runSetupStep = page.getByRole('button', { name: /Run Setup/i }).first();
  await runSetupStep.waitFor({ state: 'visible', timeout: 25_000 });
  await waitForCondition(
    async () => !(await runSetupStep.isDisabled()),
    20_000,
    120,
    'runtime_run_setup_enabled',
  );
  await runSetupStep.click();
}

async function ensureSearchProviderValue(page, baseUrl, providerValue) {
  await ensureRuntimeFlowRunSetup(page);
  const runtimeFlowCard = page.locator(
    'xpath=//h3[contains(normalize-space(), "Runtime Flow Settings")]/ancestor::div[contains(@class,"rounded")][1]',
  ).first();
  const providerSelect = runtimeFlowCard.locator(
    'xpath=.//select[option[@value="duckduckgo"] and option[@value="searxng"] and option[@value="dual"]]',
  ).first();
  await providerSelect.waitFor({ state: 'visible', timeout: 25_000 });
  await waitForCondition(
    async () => !(await providerSelect.isDisabled()),
    20_000,
    120,
    'search_provider_select_enabled',
  );

  const current = await providerSelect.inputValue();
  if (current !== providerValue) {
    await providerSelect.selectOption(providerValue);
    const runtimeSave = page.getByRole('button', { name: /^Save$/ }).first();
    const runtimeSaveVisible = await runtimeSave.isVisible().catch(() => false);
    if (runtimeSaveVisible) {
      await waitForCondition(
        async () => !(await runtimeSave.isDisabled()),
        8_000,
        120,
        'runtime_flow_save_enabled',
      );
      await runtimeSave.click();
    }
  }

  await waitForCondition(async () => {
    const payload = await apiJson(baseUrl, 'GET', '/runtime-settings');
    return payload?.searchProvider === providerValue;
  }, 25_000, 150, `runtime_search_provider_persisted_${providerValue}`);
}

async function verifyRuntimeOpsProviderBadge(page, providerValue) {
  const expectedLabel = PROVIDER_LABELS[providerValue] ?? providerValue;
  const providerBadge = page.getByText(new RegExp(`Provider:\\s*${expectedLabel}`, 'i')).first();
  await page.getByRole('link', { name: 'Runtime Ops' }).click();
  const runOption = page.locator(`option[value="${RUN_ID}"]`).first();
  await runOption.waitFor({ state: 'attached', timeout: 25_000 });
  const runSelect = runOption.locator('xpath=ancestor::select[1]').first();
  if ((await runSelect.count()) > 0) {
    await runSelect.selectOption(RUN_ID);
  }
  await page.getByRole('button', { name: 'Workers' }).click();
  if (!(await providerBadge.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Search Results/ }).first().click();
  }
  await providerBadge.waitFor({ state: 'visible', timeout: 25_000 });
}

test('GUI runtime search-provider setting persists across reload and propagates to Runtime Ops visuals for all providers', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-gui-settings-'));
  const helperFilesRoot = path.join(tempRoot, 'helper_files');
  const localOutputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  let context = null;
  let page = null;
  const logs = [];

  try {
    await ensureGuiBuilt();

    // Some routes can read default mouse assets before category selection settles.
    await seedCategory(helperFilesRoot, 'mouse');
    await seedCategory(helperFilesRoot, CATEGORY);
    await seedIndexLabRun(indexLabRoot, RUN_ID, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
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
    await apiJson(baseUrl, 'PUT', '/ui-settings', { runtimeAutoSaveEnabled: false });
    await apiJson(baseUrl, 'PUT', '/runtime-settings', {
      discoveryEnabled: true,
      searchProvider: 'searxng',
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();

    await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

    for (const provider of PROVIDER_MATRIX) {
      await ensureSearchProviderValue(page, baseUrl, provider);

      const persistedRuntimeSettings = await apiJson(baseUrl, 'GET', '/runtime-settings');
      assert.equal(
        persistedRuntimeSettings?.searchProvider,
        provider,
        `search provider should persist as ${provider} after indexing-page edit`,
      );

      await verifyRuntimeOpsProviderBadge(page, provider);
      await page.getByRole('link', { name: 'Pipeline Settings' }).click();
      await page.waitForURL(/#\/pipeline-settings/, { timeout: 20_000 });
      await selectCategory(page, CATEGORY);
      await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

    await verifyRuntimeOpsProviderBadge(page, 'dual');

    await page.getByRole('link', { name: 'Pipeline Settings' }).click();
    await page.waitForURL(/#\/pipeline-settings/, { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
    await ensureRuntimeFlowRunSetup(page);
    const providerSelectAfterReload = page.locator(
      'xpath=//h3[contains(normalize-space(), "Runtime Flow Settings")]/ancestor::div[contains(@class,"rounded")][1]//select[option[@value="duckduckgo"] and option[@value="searxng"] and option[@value="dual"]]',
    ).first();
    await providerSelectAfterReload.waitFor({ state: 'visible', timeout: 25_000 });
    assert.equal(await providerSelectAfterReload.inputValue(), 'dual', 'search provider select should remain dual after reload');

    const reloadedRuntimeSettings = await apiJson(baseUrl, 'GET', '/runtime-settings');
    assert.equal(
      reloadedRuntimeSettings?.searchProvider,
      'dual',
      'runtime settings endpoint should retain persisted search provider after reload',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[runtimeOpsGuiSettingsPersistencePropagation logs]\n', capturedLogs);
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
