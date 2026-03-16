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

const CATEGORY = 'mouse_llm_settings_gui';

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

function scopeTabPattern(scope) {
  if (scope === 'component') return /^Component Review/;
  if (scope === 'list') return /^List Review/;
  return /^Field Keys/;
}

async function openRouteEditor(page, routeKey, scope) {
  const scopeButton = page.getByRole('button', { name: scopeTabPattern(scope) }).first();
  await scopeButton.waitFor({ state: 'visible', timeout: 20_000 });
  await scopeButton.click();
  const routeButton = page.locator('button').filter({ hasText: routeKey }).first();
  await routeButton.waitFor({ state: 'visible', timeout: 25_000 });
  await routeButton.click();
}

async function readRouteRow(baseUrl, category, routeKey) {
  const payload = await apiJson(baseUrl, 'GET', `/llm-settings/${category}/routes`);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.find((row) => String(row?.route_key || '') === routeKey) || null;
}

test('GUI llm route knobs persist across manual save/autosave hard reload and keep autosave mode global', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-settings-gui-'));
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
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
    await seedCategory(categoryAuthorityRoot, 'mouse');
    await seedCategory(categoryAuthorityRoot, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');
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

    await apiJson(baseUrl, 'PUT', '/ui-settings', { llmSettingsAutoSaveEnabled: false });
    const initialRowsPayload = await apiJson(baseUrl, 'GET', `/llm-settings/${CATEGORY}/routes`);
    const initialRows = Array.isArray(initialRowsPayload?.rows) ? initialRowsPayload.rows : [];
    assert.equal(initialRows.length > 0, true, 'llm settings route matrix should contain at least one row');

    const targetRow = initialRows.find((row) => String(row?.scope || '') === 'field') || initialRows[0];
    const targetRouteKey = String(targetRow?.route_key || '');
    const targetScope = String(targetRow?.scope || 'field');
    const manualActionBaseline = String(targetRow?.insufficient_evidence_action || 'threshold_unmet');
    const manualActionTarget = manualActionBaseline === 'return_unk' ? 'threshold_unmet' : 'return_unk';
    const autosaveWebsearchTarget = !Boolean(targetRow?.enable_websearch);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.goto(`${baseUrl}/#/llm-settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=LLM Settings Studio', { timeout: 20_000 });

    await openRouteEditor(page, targetRouteKey, targetScope);

    const autoSaveCheckbox = page.locator('label:has-text("Auto-Save") input[type="checkbox"]').first();
    await autoSaveCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    if (await autoSaveCheckbox.isChecked()) {
      await autoSaveCheckbox.click();
    }
    await waitForCondition(async () => {
      const uiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
      return uiSettings?.llmSettingsAutoSaveEnabled === false;
    }, 20_000, 150, 'llm_autosave_disabled');

    const insufficientActionSelect = page.locator('xpath=//div[normalize-space()="Insufficient Evidence Action"]/following-sibling::select[1]').first();
    await insufficientActionSelect.waitFor({ state: 'visible', timeout: 20_000 });
    await insufficientActionSelect.selectOption(manualActionTarget);

    const saveButton = page.getByRole('button', { name: 'Save LLM Settings' }).first();
    await saveButton.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => !(await saveButton.isDisabled()),
      20_000,
      120,
      'llm_manual_save_enabled',
    );
    await saveButton.click();

    await waitForCondition(async () => {
      const row = await readRouteRow(baseUrl, CATEGORY, targetRouteKey);
      return row?.insufficient_evidence_action === manualActionTarget;
    }, 25_000, 150, 'llm_manual_save_persisted');

    if (!(await autoSaveCheckbox.isChecked())) {
      await autoSaveCheckbox.click();
    }
    await waitForCondition(async () => {
      const uiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
      return uiSettings?.llmSettingsAutoSaveEnabled === true;
    }, 20_000, 150, 'llm_autosave_enabled');

    const enableWebSearchCheckbox = page.locator('label:has-text("Enable Web Search") input[type="checkbox"]').first();
    await enableWebSearchCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    if ((await enableWebSearchCheckbox.isChecked()) !== autosaveWebsearchTarget) {
      await enableWebSearchCheckbox.click();
    }

    await waitForCondition(async () => {
      const row = await readRouteRow(baseUrl, CATEGORY, targetRouteKey);
      return row?.enable_websearch === autosaveWebsearchTarget;
    }, 25_000, 150, 'llm_autosave_persisted');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=LLM Settings Studio', { timeout: 20_000 });
    await openRouteEditor(page, targetRouteKey, targetScope);
    const autoSaveCheckboxAfterReload = page.locator('label:has-text("Auto-Save") input[type="checkbox"]').first();
    const enableWebSearchAfterReload = page.locator('label:has-text("Enable Web Search") input[type="checkbox"]').first();
    await autoSaveCheckboxAfterReload.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await enableWebSearchAfterReload.isChecked(),
      autosaveWebsearchTarget,
      'enable web search knob should remain persisted after hard reload',
    );
    assert.equal(
      await autoSaveCheckboxAfterReload.isChecked(),
      true,
      'llm autosave checkbox should remain enabled after hard reload',
    );

    const persistedUiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
    assert.equal(
      persistedUiSettings?.llmSettingsAutoSaveEnabled,
      true,
      'llm autosave global toggle should persist via ui settings',
    );

    const persistedRow = await readRouteRow(baseUrl, CATEGORY, targetRouteKey);
    assert.equal(
      persistedRow?.insufficient_evidence_action,
      manualActionTarget,
      'manual-save route action should remain persisted after reload',
    );
    assert.equal(
      persistedRow?.enable_websearch,
      autosaveWebsearchTarget,
      'autosave route websearch flag should remain persisted after reload',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[llmSettingsGuiPersistencePropagation logs]\n', capturedLogs);
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

