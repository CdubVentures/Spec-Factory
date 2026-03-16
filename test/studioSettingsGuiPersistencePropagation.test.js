import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  FIELD_RULES_FIELDS,
  writeJson,
  seedFieldRules,
  seedComponentDb,
  seedKnownValues,
  seedWorkbookMap,
  findFreePort,
  waitForServerReady,
  apiJson,
  stopProcess,
} from './fixtures/reviewLaneFixtures.js';

const CATEGORY = 'mouse_studio_settings_gui';

async function ensureGuiBuilt() {
  const distIndex = path.join(path.resolve('.'), 'tools', 'gui-react', 'dist', 'index.html');
  try {
    await fs.access(distIndex);
  } catch {
    throw new Error(`gui_dist_missing:${distIndex}`);
  }
}

async function waitForCondition(predicate, timeoutMs = 15_000, intervalMs = 120, label = 'condition') {
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

async function seedStudioCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
  await writeJson(path.join(helperRoot, category, '_control_plane', 'field_studio_map.json'), {
    version: 1,
    selected_keys: Object.keys(FIELD_RULES_FIELDS),
    field_overrides: {},
    component_sources: [],
    tooltip_sources: {},
    enum_lists: {},
  });
}

async function ensureStudioAutoSaveAllPersisted(page, baseUrl) {
  const autoSaveAllButton = page.locator('button').filter({ hasText: /Auto-Save All (On|Off)/ }).first();
  await autoSaveAllButton.waitFor({ state: 'visible', timeout: 20_000 });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const current = await apiJson(baseUrl, 'GET', '/ui-settings');
    if (current?.studioAutoSaveAllEnabled === true) {
      await page.waitForSelector('button:has-text("Auto-Save All On")', { timeout: 20_000 });
      return;
    }

    const buttonText = String(await autoSaveAllButton.innerText());
    if (buttonText.includes('Auto-Save All On')) {
      await autoSaveAllButton.click();
      await page.waitForSelector('button:has-text("Auto-Save All Off")', { timeout: 20_000 });
    }

    await autoSaveAllButton.click();
    await page.waitForSelector('button:has-text("Auto-Save All On")', { timeout: 20_000 });

    try {
      await waitForCondition(async () => {
        const payload = await apiJson(baseUrl, 'GET', '/ui-settings');
        return payload?.studioAutoSaveAllEnabled === true;
      }, 20_000, 150, `ui_settings_autosave_all_persisted_attempt_${attempt}`);
      return;
    } catch {
      // Retry a fresh toggle cycle in case the first click raced initial hydration.
    }
  }

  throw new Error('studio_autosave_all_not_persisted');
}

test('GUI studio autosave settings persist across reload and propagate across shared tabs', { timeout: 240_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-settings-gui-'));
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out'),
  };
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  let context = null;
  let page = null;
  const logs = [];

  try {
    await ensureGuiBuilt();

    // Default "mouse" routes may be requested before category selection settles.
    await seedStudioCategory(config.categoryAuthorityRoot, 'mouse');
    await seedStudioCategory(config.categoryAuthorityRoot, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');
    child = spawn('node', [guiServerPath, '--port', String(port), '--local'], {
      cwd: tempRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: config.categoryAuthorityRoot,
        LOCAL_OUTPUT_ROOT: config.localOutputRoot,
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
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    await page.goto(`${baseUrl}/#/studio`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);

    await ensureStudioAutoSaveAllPersisted(page, baseUrl);

    await page.getByRole('button', { name: '2) Key Navigator' }).click();
    await page.waitForSelector('button:has-text("Auto-Save On (Locked)")', { timeout: 20_000 });

    await page.getByRole('button', { name: '1) Mapping Studio' }).click();
    await page.waitForSelector('button:has-text("Auto-Save On (Locked)")', { timeout: 20_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
    await selectCategory(page, CATEGORY);

    await page.waitForSelector('button:has-text("Auto-Save All On")', { timeout: 20_000 });
    await page.getByRole('button', { name: '2) Key Navigator' }).click();
    await page.waitForSelector('button:has-text("Auto-Save On (Locked)")', { timeout: 20_000 });

    const persistedUiSettings = await apiJson(baseUrl, 'GET', '/ui-settings');
    assert.equal(
      persistedUiSettings?.studioAutoSaveAllEnabled,
      true,
      'studio auto-save all should remain true after GUI reload',
    );
    assert.equal(
      persistedUiSettings?.studioAutoSaveMapEnabled,
      true,
      'studio mapping autosave should remain locked on when auto-save all is enabled',
    );
    assert.equal(
      persistedUiSettings?.studioAutoSaveEnabled,
      true,
      'studio key navigator autosave should remain locked on when auto-save all is enabled',
    );
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[studioSettingsGuiPersistencePropagation logs]\n', capturedLogs);
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
