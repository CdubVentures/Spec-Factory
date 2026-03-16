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

const CATEGORY = 'mouse_storage_settings_gui';

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

function storageCard(page) {
  return page.locator('h2:has-text("Run Data Storage")').locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

async function setStorageAutoSave(page, baseUrl, enabled) {
  const card = storageCard(page);
  const expectedLabel = enabled ? 'Auto-Save On' : 'Auto-Save Off';
  const inverseLabel = enabled ? 'Auto-Save Off' : 'Auto-Save On';
  const expectedToggle = card.getByRole('button', { name: expectedLabel, exact: true }).first();
  if ((await expectedToggle.count()) === 0) {
    const toggleButton = card.getByRole('button', { name: inverseLabel, exact: true }).first();
    await toggleButton.waitFor({ state: 'visible', timeout: 20_000 });
    await toggleButton.click();
  }
  await waitForCondition(async () => {
    const uiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
    return uiSettings?.storageAutoSaveEnabled === enabled;
  }, 20_000, 150, `ui_settings_storage_autosave_${enabled ? 'on' : 'off'}`);
  await waitForCondition(
    async () => (await card.getByRole('button', { name: expectedLabel, exact: true }).count()) > 0,
    20_000,
    120,
    `storage_autosave_toggle_label_${enabled ? 'on' : 'off'}`,
  );
}

test('GUI storage settings persist across reload for manual-save and autosave paths', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-settings-gui-'));
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const localOutputRoot = path.join(tempRoot, 'out');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');
  const localDirectory = path.join(tempRoot, 'storage-target-local');

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

    await apiJson(baseUrl, 'PUT', '/ui-settings', { storageAutoSaveEnabled: false });
    await apiJson(baseUrl, 'PUT', '/storage-settings', {
      enabled: true,
      destinationType: 'local',
      localDirectory,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.goto(`${baseUrl}/#/storage`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=Run Data Storage', { timeout: 20_000 });

    await setStorageAutoSave(page, baseUrl, false);

    const card = storageCard(page);
    await card.getByRole('button', { name: 'S3', exact: true }).click();
    await page.waitForSelector('text=S3 Destination', { timeout: 20_000 });

    const relocationCheckbox = page.locator('label:has-text("Enable automatic run-data relocation") input[type="checkbox"]').first();
    await relocationCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
    if (!(await relocationCheckbox.isChecked())) {
      await relocationCheckbox.click();
    }

    const regionInput = page.locator('label:has-text("Region") input').first();
    const bucketInput = page.locator('label:has-text("Bucket") input').first();
    const prefixInput = page.locator('label:has-text("Prefix") input').first();
    const accessKeyInput = page.locator('label:has-text("Access Key Id") input').first();
    await regionInput.fill('us-west-1');
    await bucketInput.fill('spec-factory-gui-storage');
    await prefixInput.fill('gui-manual-prefix');
    await accessKeyInput.fill('AKIA_GUI_STORAGE');

    const saveButton = card.getByRole('button', { name: 'Save', exact: true }).first();
    await saveButton.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => !(await saveButton.isDisabled()),
      20_000,
      120,
      'storage_manual_save_enabled',
    );
    await saveButton.click();

    await waitForCondition(async () => {
      const persisted = await apiJson(baseUrl, 'GET', '/storage-settings');
      return persisted?.enabled === true
        && persisted?.destinationType === 's3'
        && persisted?.awsRegion === 'us-west-1'
        && persisted?.s3Bucket === 'spec-factory-gui-storage'
        && persisted?.s3Prefix === 'gui-manual-prefix'
        && persisted?.s3AccessKeyId === 'AKIA_GUI_STORAGE';
    }, 25_000, 150, 'storage_manual_save_persisted');

    await setStorageAutoSave(page, baseUrl, true);

    await prefixInput.fill('gui-autosave-prefix');
    await waitForCondition(async () => {
      const persisted = await apiJson(baseUrl, 'GET', '/storage-settings');
      return persisted?.s3Prefix === 'gui-autosave-prefix';
    }, 25_000, 150, 'storage_autosave_prefix_persisted');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);
    await page.waitForSelector('text=S3 Destination', { timeout: 20_000 });

    const regionAfterReload = page.locator('label:has-text("Region") input').first();
    const bucketAfterReload = page.locator('label:has-text("Bucket") input').first();
    const prefixAfterReload = page.locator('label:has-text("Prefix") input').first();
    const accessAfterReload = page.locator('label:has-text("Access Key Id") input').first();

    assert.equal(await regionAfterReload.inputValue(), 'us-west-1', 's3 region should persist after reload');
    assert.equal(await bucketAfterReload.inputValue(), 'spec-factory-gui-storage', 's3 bucket should persist after reload');
    assert.equal(await prefixAfterReload.inputValue(), 'gui-autosave-prefix', 'autosaved s3 prefix should persist after reload');
    assert.equal(await accessAfterReload.inputValue(), 'AKIA_GUI_STORAGE', 's3 access key id should persist after reload');
    const saveButtonAfterReload = storageCard(page).getByRole('button', { name: 'Save', exact: true }).first();
    await saveButtonAfterReload.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(
      await saveButtonAfterReload.isDisabled(),
      true,
      'manual save button should be disabled when storage autosave is enabled',
    );

    const persistedUiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
    assert.equal(
      persistedUiSettings?.storageAutoSaveEnabled,
      true,
      'storage autosave toggle should persist via ui settings after reload',
    );

    const persistedStorageSettings = await apiJson(baseUrl, 'GET', '/storage-settings');
    assert.equal(persistedStorageSettings?.destinationType, 's3', 'storage destination should persist as s3 after reload');
    assert.equal(persistedStorageSettings?.s3Prefix, 'gui-autosave-prefix', 'storage autosave write should persist after reload');
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[storageSettingsGuiPersistencePropagation logs]\n', capturedLogs);
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
