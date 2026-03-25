import assert from 'node:assert/strict';
import { waitForCondition } from '../../../../features/review/__tests__/helpers/reviewLaneGuiHarness.js';

function readRootThemeState(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-sf-theme'),
    mode: document.documentElement.getAttribute('data-sf-theme-mode'),
    radius: document.documentElement.getAttribute('data-sf-radius'),
    density: document.documentElement.getAttribute('data-sf-density'),
    darkClass: document.documentElement.classList.contains('dark'),
    storedTheme: localStorage.getItem('ui:themeColorProfile'),
    storedRadius: localStorage.getItem('ui:themeRadiusProfile'),
  }));
}

export async function runThemeProfileGuiContract({ baseUrl, page }) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ui:themeColorProfile')) {
      localStorage.setItem('ui:themeColorProfile', 'slate');
    }
    if (!localStorage.getItem('ui:themeRadiusProfile')) {
      localStorage.setItem('ui:themeRadiusProfile', 'relaxed');
    }
    if (!localStorage.getItem('ui:themeDensityProfile')) {
      localStorage.setItem('ui:themeDensityProfile', 'standard');
    }
    if (!localStorage.getItem('ui:darkMode')) {
      localStorage.setItem('ui:darkMode', 'true');
    }
  });

  await page.goto(`${baseUrl}/#/pipeline-settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
  await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

  await waitForCondition(async () => {
    const state = await readRootThemeState(page);
    return (
      state.theme === 'slate'
      && state.mode === 'dark'
      && state.radius === 'relaxed'
      && state.density === 'standard'
      && state.darkClass === true
    );
  }, 20_000, 150, 'persisted_theme_hydrated');

  assert.equal(await page.getByText('Appearance', { exact: true }).count(), 0, 'pipeline page should not inline appearance controls');
  assert.equal(await page.getByText('Corner Radius', { exact: true }).count(), 0, 'pipeline page should not inline radius controls');

  const openSettingsButton = page.getByRole('button', { name: /Open app settings/i }).first();
  await openSettingsButton.waitFor({ state: 'visible', timeout: 20_000 });
  await openSettingsButton.click();

  await page.getByText('Appearance', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('Theme', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('Corner Radius', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'Sand', exact: true }).click();
  await page.getByRole('button', { name: 'Pill Heavy', exact: true }).click();

  await waitForCondition(async () => {
    const state = await readRootThemeState(page);
    return (
      state.theme === 'sand'
      && state.mode === 'light'
      && state.radius === 'pill-heavy'
      && state.darkClass === false
      && state.storedTheme === 'sand'
      && state.storedRadius === 'pill-heavy'
    );
  }, 20_000, 150, 'theme_switch_persisted');

  const closeSettingsButton = page.getByRole('button', { name: /Close app settings/i }).first();
  await closeSettingsButton.click();
  await waitForCondition(
    async () => (await page.getByText('Appearance', { exact: true }).count()) === 0,
    5_000,
    100,
    'appearance_panel_closed',
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Spec Factory', { timeout: 20_000 });
  await page.waitForSelector('text=Pipeline Settings', { timeout: 20_000 });

  await waitForCondition(async () => {
    const state = await readRootThemeState(page);
    return (
      state.theme === 'sand'
      && state.mode === 'light'
      && state.radius === 'pill-heavy'
      && state.darkClass === false
    );
  }, 20_000, 150, 'theme_persisted_after_reload');

  assert.equal(await page.getByText('Appearance', { exact: true }).count(), 0, 'appearance controls should remain owned by the app-shell drawer after reload');
}
