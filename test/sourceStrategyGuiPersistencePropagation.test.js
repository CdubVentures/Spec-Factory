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
  apiJson,
  stopProcess,
} from './fixtures/reviewLaneFixtures.js';

const CATEGORY = 'mouse';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    const ok = await predicate();
    if (ok) return;
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

async function seedCategory(categoryAuthorityRoot, category) {
  await seedFieldRules(categoryAuthorityRoot, category);
  await seedComponentDb(categoryAuthorityRoot, category);
  await seedKnownValues(categoryAuthorityRoot, category);
  await seedWorkbookMap(categoryAuthorityRoot, category);
}

async function seedSourcesJson(categoryAuthorityRoot, category) {
  const dir = path.join(categoryAuthorityRoot, category);
  await fs.mkdir(dir, { recursive: true });
  const sourcesData = {
    category,
    version: '1.0.0',
    approved: { manufacturer: [], lab: ['gui-source.example.com'], database: [], retailer: [] },
    denylist: [],
    sources: {
      gui_sourceexamplecom: {
        display_name: 'GUI Source Strategy',
        tier: 'tier2_lab',
        authority: 'instrumented',
        base_url: 'https://gui-source.example.com',
        content_types: ['review'],
        doc_kinds: ['review'],
        crawl_config: { method: 'http', rate_limit_ms: 2000, timeout_ms: 12000, robots_txt_compliant: true },
        field_coverage: { high: [], medium: [], low: [] },
        discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 55, enabled: true, notes: '' },
      },
    },
  };
  await fs.writeFile(path.join(dir, 'sources.json'), JSON.stringify(sourcesData, null, 2));
}

test('GUI source strategy toggle persists across reload in pipeline settings', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'source-strategy-gui-'));
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const localOutputRoot = path.join(tempRoot, 'out');
  const repoRoot = REPO_ROOT;
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  let context = null;
  let page = null;
  const logs = [];

  try {
    await ensureGuiBuilt();
    await seedCategory(categoryAuthorityRoot, CATEGORY);
    await seedSourcesJson(categoryAuthorityRoot, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.join(repoRoot, 'src', 'api', 'guiServer.js');
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

    const sourceEntries = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(CATEGORY)}`);
    assert.ok(Array.isArray(sourceEntries) && sourceEntries.length > 0, 'should have source entries');
    const entry = sourceEntries[0];
    const sourceId = String(entry.sourceId || '');
    const host = entry.base_url ? new URL(entry.base_url).hostname : sourceId.replace(/_/g, '.');

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
      const entries = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(CATEGORY)}`);
      const found = Array.isArray(entries) ? entries.find((e) => e.sourceId === sourceId) : null;
      return found && found.discovery && found.discovery.enabled === false;
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
    assert.equal(
      String(await toggleAfterReload.innerText()).trim(),
      'OFF',
      'source strategy toggle text should persist after reload',
    );

    const persistedEntries = await apiJson(baseUrl, 'GET', `/source-strategy?category=${encodeURIComponent(CATEGORY)}`);
    const persistedEntry = Array.isArray(persistedEntries)
      ? persistedEntries.find((e) => e.sourceId === sourceId)
      : null;
    assert.equal(
      persistedEntry?.discovery?.enabled,
      false,
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
