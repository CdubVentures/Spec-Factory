/**
 * UI settings round-trip tests for the critical runtime flow.
 *
 * These specs stay at the UI/API boundary:
 * change a named control in the browser, observe the save request, verify the
 * persisted API snapshot, and confirm the value survives reload.
 */

import { test, expect } from './fixtures.ts';

const RUNTIME_AUTOSAVE_WAIT_MS = 2_000;

function getAutoScrollSwitch(page: import('playwright/test').Page) {
  return page.locator('[role="switch"]').first();
}

async function setRuntimeAutoSaveEnabled(
  page: import('playwright/test').Page,
  settingsApi: { get: (domain: string) => Promise<Record<string, unknown>> },
  expected: boolean,
) {
  const autoSaveButton = page.getByRole('button', { name: /Auto-Save (On|Off)/ }).first();
  await expect(autoSaveButton).toBeVisible();
  const currentLabel = ((await autoSaveButton.textContent()) || '').trim();
  const currentEnabled = currentLabel === 'Auto-Save On';
  if (currentEnabled !== expected) {
    await autoSaveButton.click();
  }
  await expect(autoSaveButton).toHaveText(expected ? 'Auto-Save On' : 'Auto-Save Off');
  await expect.poll(async () => {
    const snapshot = await settingsApi.get('ui');
    return Boolean(snapshot.runtimeAutoSaveEnabled);
  }).toBe(expected);
}

async function openPipelineFetcherAutoScroll(page: import('playwright/test').Page) {
  await page.goto('/#/pipeline-settings');
  const fetcherButton = page.getByRole('button', { name: /^Runtime Fetcher\b/ });
  await expect(fetcherButton).toBeVisible();
  await fetcherButton.click();
  const autoScrollButton = page.getByRole('button', { name: /^Auto Scroll\b/ });
  await expect(autoScrollButton).toBeVisible();
  await autoScrollButton.click();
  await expect(page.getByText(/Auto Scroll Enabled/)).toBeVisible();
  await expect(getAutoScrollSwitch(page)).toBeVisible();
}

test.describe('Pipeline Settings - runtime setting round-trip', () => {
  test('Auto Scroll Enabled auto-saves to the runtime API and survives reload', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const uiBaseline = await settingsApi.get('ui');
    const originalValue = Boolean(baseline.autoScrollEnabled);
    const originalAutoSave = Boolean(uiBaseline.runtimeAutoSaveEnabled);
    const newValue = !originalValue;

    try {
      await openPipelineFetcherAutoScroll(page);
      await setRuntimeAutoSaveEnabled(page, settingsApi, true);

      const autoScrollSwitch = getAutoScrollSwitch(page);
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

      await openPipelineFetcherAutoScroll(page);
      await expect(autoScrollSwitch).toHaveAttribute('aria-checked', String(newValue));
    } finally {
      await settingsApi.put('runtime', { autoScrollEnabled: originalValue });
      await settingsApi.put('ui', { runtimeAutoSaveEnabled: originalAutoSave });
    }
  });

  test('Auto Scroll Enabled requires manual Save when runtime auto-save is off', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const uiBaseline = await settingsApi.get('ui');
    const originalValue = Boolean(baseline.autoScrollEnabled);
    const originalAutoSave = Boolean(uiBaseline.runtimeAutoSaveEnabled);
    const newValue = !originalValue;
    const runtimePutRequests: string[] = [];

    const onRequest = (request: import('playwright/test').Request) => {
      if (request.url().includes('/api/v1/runtime-settings') && request.method() === 'PUT') {
        runtimePutRequests.push(request.url());
      }
    };

    page.on('request', onRequest);
    try {
      await openPipelineFetcherAutoScroll(page);
      await setRuntimeAutoSaveEnabled(page, settingsApi, false);

      const autoScrollSwitch = getAutoScrollSwitch(page);
      const requestCountBeforeEdit = runtimePutRequests.length;
      if (((await autoScrollSwitch.getAttribute('aria-checked')) === 'true') !== newValue) {
        await autoScrollSwitch.click();
      }

      await page.waitForTimeout(RUNTIME_AUTOSAVE_WAIT_MS);
      expect(runtimePutRequests.length).toBe(requestCountBeforeEdit);
      await expect.poll(async () => {
        const afterEdit = await settingsApi.get('runtime');
        return Boolean(afterEdit.autoScrollEnabled);
      }).toBe(originalValue);

      const saveRequestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/v1/runtime-settings') && request.method() === 'PUT');
      await page.getByRole('button', { name: /^Save$/ }).click();
      const saveRequest = await saveRequestPromise;
      expect(saveRequest.postDataJSON()).toMatchObject({ autoScrollEnabled: newValue });

      await expect.poll(async () => {
        const afterSave = await settingsApi.get('runtime');
        return Boolean(afterSave.autoScrollEnabled);
      }).toBe(newValue);

      await openPipelineFetcherAutoScroll(page);
      await expect(getAutoScrollSwitch(page)).toHaveAttribute('aria-checked', String(newValue));
    } finally {
      page.off('request', onRequest);
      await settingsApi.put('runtime', { autoScrollEnabled: originalValue });
      await settingsApi.put('ui', { runtimeAutoSaveEnabled: originalAutoSave });
    }
  });
});
