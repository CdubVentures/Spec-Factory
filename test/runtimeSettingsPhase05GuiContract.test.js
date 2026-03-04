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

const CATEGORY = 'mouse_runtime_phase05_gui_contract';

const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

const EXPECTED_STEP_ORDER = [
  'Run Setup',
  'Runtime Outputs',
  'Consensus and Learning',
  'Observability and Trace',
  'Fetch and Render',
  'OCR',
  'Planner and Triage',
  'Role Routing',
  'Fallback Routing',
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

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

function runtimeFlowCard(page) {
  return page.locator(
    'xpath=//h3[contains(normalize-space(), "Runtime Flow Settings")]/ancestor::div[contains(@class,"rounded")][1]',
  ).first();
}

function runtimeProviderSelect(card) {
  return card.locator(
    'xpath=.//select[option[@value="duckduckgo"] and option[@value="searxng"] and option[@value="dual"]]',
  ).first();
}

async function openPipelineRuntimeFlow(page, baseUrl) {
  await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
  await selectCategory(page, CATEGORY);
  await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });
  await page.waitForSelector('text=Runtime Flow Settings', { timeout: 20_000 });
}

async function assertRuntimeStepOrder(card) {
  const buttons = card.locator('aside').first().locator('button');
  const stepCount = await buttons.count();
  assert.equal(stepCount, EXPECTED_STEP_ORDER.length, 'runtime flow should render expanded ordered main steps');

  for (let idx = 0; idx < EXPECTED_STEP_ORDER.length; idx += 1) {
    const text = normalizeText(await buttons.nth(idx).innerText());
    assert.match(
      text,
      new RegExp(EXPECTED_STEP_ORDER[idx].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `runtime step index ${idx + 1} should contain "${EXPECTED_STEP_ORDER[idx]}"`,
    );
  }
}

async function assertRuntimeSubStepNavigation(card) {
  const sectionHeading = card.locator('text=Runtime Sections').first();
  await sectionHeading.waitFor({ state: 'visible', timeout: 20_000 });

  const runSetupStep = card.getByRole('button', { name: /^Run Setup/i }).first();
  await runSetupStep.click();

  const subStepButtons = card.locator('button[data-runtime-substep]');
  await waitForCondition(
    async () => (await subStepButtons.count()) >= 2,
    20_000,
    120,
    'runtime_substep_buttons_visible',
  );

  const labels = [];
  const count = await subStepButtons.count();
  for (let idx = 0; idx < count; idx += 1) {
    // eslint-disable-next-line no-await-in-loop
    labels.push(normalizeText(await subStepButtons.nth(idx).innerText()));
  }

  assert.ok(
    labels.some((label) => /Discovery and Policy/i.test(label)),
    `expected Discovery and Policy sub-step button, found: ${labels.join(' | ')}`,
  );
  assert.ok(
    labels.some((label) => /Resume and Re-extract/i.test(label)),
    `expected Resume and Re-extract sub-step button, found: ${labels.join(' | ')}`,
  );
}

async function assertNoSingletonSubStepMenus(card) {
  const mainStepButtons = card.locator('aside').first().locator('button');
  const count = await mainStepButtons.count();

  for (let idx = 0; idx < count; idx += 1) {
    const stepButton = mainStepButtons.nth(idx);
    // eslint-disable-next-line no-await-in-loop
    await stepButton.click();

    const subStepButtons = card.locator('button[data-runtime-substep]');
    // eslint-disable-next-line no-await-in-loop
    const subCount = await subStepButtons.count();
    assert.equal(
      subCount === 0 || subCount >= 2,
      true,
      `runtime sub-step menu should not render a singleton list (step index ${idx}, found ${subCount})`,
    );
  }
}

async function assertDiscoveryDependency(card) {
  const runSetupStep = card.getByRole('button', { name: /Run Setup/i }).first();
  await runSetupStep.click();

  const providerSelect = runtimeProviderSelect(card);
  await providerSelect.waitFor({ state: 'visible', timeout: 20_000 });

  const discoveryRow = card
    .locator('xpath=.//div[contains(@class,"grid")][.//span[contains(normalize-space(),"Discovery Enabled")]]')
    .first();
  const discoverySwitch = discoveryRow.getByRole('switch').first();
  await discoverySwitch.waitFor({ state: 'visible', timeout: 20_000 });

  const currentlyChecked = (await discoverySwitch.getAttribute('aria-checked')) === 'true';
  if (currentlyChecked) {
    await discoverySwitch.click();
  }

  await waitForCondition(
    async () => await providerSelect.isDisabled(),
    20_000,
    120,
    'search_provider_disabled_when_discovery_off',
  );

  const plannerStep = card.getByRole('button', { name: /Planner and Triage/i }).first();
  await waitForCondition(
    async () => normalizeText(await plannerStep.innerText()).includes('Disabled by master toggle'),
    20_000,
    120,
    'planner_step_disabled_copy',
  );
  assert.equal(
    await plannerStep.locator('span[title="Disabled by master toggle"]').count() > 0,
    true,
    'planner step should render gray/disabled dot semantics when discovery is off',
  );
}

async function assertResetDefaultsConfirm(page) {
  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  const resetButton = page.getByRole('button', { name: 'Reset', exact: true }).first();
  await resetButton.waitFor({ state: 'visible', timeout: 20_000 });
  await resetButton.click();

  await waitForCondition(
    async () => dialogMessage.length > 0,
    5_000,
    100,
    'reset_defaults_dialog',
  );
  assert.match(
    dialogMessage,
    /Reset all runtime settings to defaults\?/,
    'runtime reset should require explicit confirmation prompt',
  );
}

async function assertTooltipPresence(card) {
  const tooltipTriggers = card.locator('span.cursor-help');
  const count = await tooltipTriggers.count();
  assert.ok(count >= 8, `runtime flow should render visible tooltip triggers (found ${count})`);
}

test('phase-05 runtime flow GUI contract holds for desktop and mobile viewports', { timeout: 300_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-phase05-gui-contract-'));
  const helperFilesRoot = path.join(tempRoot, 'helper_files');
  const localOutputRoot = path.join(tempRoot, 'out');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
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

    await apiJson(baseUrl, 'PUT', '/runtime-settings', {
      discoveryEnabled: true,
      searchProvider: 'duckduckgo',
    });

    browser = await chromium.launch({ headless: true });

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      try {
        await openPipelineRuntimeFlow(page, baseUrl);
        const card = runtimeFlowCard(page);
        await card.waitFor({ state: 'visible', timeout: 20_000 });

        await assertRuntimeStepOrder(card);
        await assertRuntimeSubStepNavigation(card);
        await assertNoSingletonSubStepMenus(card);
        await assertTooltipPresence(card);
        await assertDiscoveryDependency(card);
        await assertResetDefaultsConfirm(page);
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  } catch (error) {
    const capturedLogs = logs.join('');
    if (capturedLogs) {
      console.error('\n[runtimeSettingsPhase05GuiContract logs]\n', capturedLogs);
    }
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopProcess(child);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});
