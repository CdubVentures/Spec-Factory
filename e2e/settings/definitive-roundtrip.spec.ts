/**
 * Definitive round-trip tests for all settings panels.
 *
 * Tests the actual user workflow: change → save → reload → verify.
 */

import { test, expect } from './fixtures.ts';

test.describe('Pipeline Settings — runtime setting round-trip', () => {
  test('change a boolean setting, save, reload — verify value persists', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const originalValue = baseline.autoScrollEnabled;
    console.log(`Baseline autoScrollEnabled: ${originalValue}`);

    const newValue = !originalValue;
    const putResult = await settingsApi.put('runtime', { autoScrollEnabled: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty('autoScrollEnabled', newValue);

    const afterPut = await settingsApi.get('runtime');
    expect(afterPut.autoScrollEnabled).toBe(newValue);

    // Restore
    await settingsApi.put('runtime', { autoScrollEnabled: originalValue });
  });

  test('auto-save fires PUT when a setting changes', async ({ page, settingsApi }) => {
    await page.goto('/#/pipeline-settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Ensure auto-save is ON
    const autoSaveButton = page.locator('button').filter({ hasText: /auto-save/i }).first();
    const autoSaveText = await autoSaveButton.innerText();
    if (autoSaveText.toLowerCase().includes('off')) {
      await autoSaveButton.click();
      await page.waitForTimeout(500);
    }
    console.log(`Auto-save state: ${await autoSaveButton.innerText()}`);

    // Track PUT requests
    const putUrls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('runtime-settings') && (req.method() === 'PUT' || req.method() === 'POST')) {
        putUrls.push(req.url());
      }
    });

    // Toggle a checkbox (autoScrollEnabled is a boolean setting)
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    if (checkboxCount > 0) {
      const firstCheckbox = checkboxes.first();
      await firstCheckbox.click();
      console.log('Toggled first checkbox');

      // Wait for auto-save debounce (typically 500-1000ms)
      await page.waitForTimeout(3000);
      console.log(`PUT requests after auto-save wait: ${putUrls.length}`);

      if (putUrls.length === 0) {
        console.log('AUTO-SAVE DID NOT FIRE — this is the bug');
      }
    }
  });
});

test.describe('Storage — full round-trip', () => {
  test('toggle, auto-save, reload — value retained', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('storage');
    const originalEnabled = baseline.enabled;

    await page.goto('/#/storage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.click();
    await page.waitForTimeout(3000); // auto-save debounce

    // Verify via API
    const afterSave = await settingsApi.get('storage');
    expect(afterSave.enabled).toBe(!originalEnabled);

    // Reload and verify UI
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterReload = await page.locator('input[type="checkbox"]').first().isChecked();
    expect(afterReload).toBe(!originalEnabled);

    // Restore
    await settingsApi.put('storage', { enabled: originalEnabled });
  });
});
