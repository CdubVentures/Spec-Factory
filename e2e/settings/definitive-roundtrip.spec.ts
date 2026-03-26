/**
 * UI settings round-trip tests for the critical runtime and storage flows.
 *
 * These specs stay at the UI/API boundary:
 * change a named control in the browser, observe the save request, verify the
 * persisted API snapshot, and confirm the value survives reload.
 */

import { test, expect } from './fixtures.ts';

function findRuntimeSwitch(page: import('playwright/test').Page, label: string) {
  if (label === 'Auto Scroll Enabled') {
    return page.locator('[role="switch"]').first();
  }

  return page.getByText(label, { exact: true });
}

async function ensureAutoSaveEnabled(page: import('playwright/test').Page) {
  const autoSaveButton = page.getByRole('button', { name: /Auto-Save (On|Off)/ }).first();
  await expect(autoSaveButton).toBeVisible();
  if ((await autoSaveButton.innerText()).trim() === 'Auto-Save Off') {
    await autoSaveButton.click();
  }
  await expect(autoSaveButton).toHaveText('Auto-Save On');
}

async function openPipelineFetcherBrowser(page: import('playwright/test').Page) {
  await page.goto('/#/pipeline-settings');
  const fetcherButton = page.getByRole('button', { name: /^Runtime Fetcher\b/ });
  await expect(fetcherButton).toBeVisible();
  await fetcherButton.click();
  await page.getByRole('button', { name: /^Browser & Rendering\b/ }).click();
  await expect(findRuntimeSwitch(page, 'Auto Scroll Enabled')).toBeVisible();
}

test.describe('Pipeline Settings - runtime setting round-trip', () => {
  test('Auto Scroll Enabled auto-saves to the runtime API and survives reload', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const originalValue = Boolean(baseline.autoScrollEnabled);
    const newValue = !originalValue;

    try {
      await openPipelineFetcherBrowser(page);
      await ensureAutoSaveEnabled(page);

      const autoScrollSwitch = findRuntimeSwitch(page, 'Auto Scroll Enabled');
      const saveRequestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/v1/runtime-settings') && request.method() === 'PUT');

      if (((await autoScrollSwitch.getAttribute('aria-checked')) === 'true') !== newValue) {
        await autoScrollSwitch.click();
      }

      const saveRequest = await saveRequestPromise;
      expect(saveRequest.postDataJSON()).toMatchObject({ autoScrollEnabled: newValue });

      await expect.poll(async () => {
        const afterSave = await settingsApi.get('runtime');
        return Boolean(afterSave.autoScrollEnabled);
      }).toBe(newValue);

      await openPipelineFetcherBrowser(page);
      await expect(autoScrollSwitch).toHaveAttribute('aria-checked', String(newValue));
    } finally {
      await settingsApi.put('runtime', { autoScrollEnabled: originalValue });
    }
  });
});

test.describe('Storage - full round-trip', () => {
  test('auto-archive toggle auto-saves to storage settings and survives reload', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('storage');
    const originalEnabled = Boolean(baseline.enabled);
    const newEnabled = !originalEnabled;

    try {
      await page.goto('/#/storage');
      await ensureAutoSaveEnabled(page);

      const autoArchiveCheckbox = page.getByLabel('Auto-archive runs after completion');
      await expect(autoArchiveCheckbox).toBeVisible();

      const saveRequestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/v1/storage-settings') && request.method() === 'PUT');

      if ((await autoArchiveCheckbox.isChecked()) !== newEnabled) {
        await autoArchiveCheckbox.click();
      }

      const saveRequest = await saveRequestPromise;
      expect(saveRequest.postDataJSON()).toMatchObject({ enabled: newEnabled });

      await expect.poll(async () => {
        const afterSave = await settingsApi.get('storage');
        return Boolean(afterSave.enabled);
      }).toBe(newEnabled);

      await page.reload();
      if (newEnabled) {
        await expect(autoArchiveCheckbox).toBeChecked();
      } else {
        await expect(autoArchiveCheckbox).not.toBeChecked();
      }
    } finally {
      await settingsApi.put('storage', { enabled: originalEnabled });
    }
  });
});
