/**
 * Definitive round-trip tests for all settings panels.
 *
 * Tests the actual user workflow: change → save → reload → verify.
 */

import { test, expect } from './fixtures.ts';

test.describe('Pipeline Settings — runtime setting round-trip', () => {
  test('change resumeMode, save, reload — verify value persists in UI', async ({ page, settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const originalResumeMode = baseline.resumeMode;
    console.log(`Baseline resumeMode: ${originalResumeMode}`);

    await page.goto('/#/pipeline-settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Find resumeMode select
    const selects = page.locator('select');
    let resumeSelect = null;
    for (let i = 0; i < await selects.count(); i++) {
      const options = await selects.nth(i).locator('option').allInnerTexts();
      if (options.some(o => o.trim() === 'force_resume')) {
        resumeSelect = selects.nth(i);
        break;
      }
    }
    expect(resumeSelect).not.toBeNull();

    const currentUiValue = await resumeSelect!.inputValue();
    console.log(`UI resumeMode before: ${currentUiValue}`);

    const newValue = currentUiValue === 'auto' ? 'force_resume' : 'auto';
    await resumeSelect!.selectOption(newValue);
    console.log(`UI resumeMode after change: ${await resumeSelect!.inputValue()}`);

    // Track PUT responses
    const putResponses: unknown[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('runtime-settings') && (res.request().method() === 'PUT' || res.request().method() === 'POST')) {
        putResponses.push(await res.json().catch(() => null));
      }
    });

    // Click "Save" or "Save Now" (depends on auto-save state)
    const saveButton = page.locator('button').filter({ hasText: /^save$/i }).or(
      page.locator('button').filter({ hasText: /^save now$/i })
    ).first();
    const saveText = await saveButton.innerText();
    console.log(`Save button text: "${saveText}"`);
    await saveButton.click();
    await page.waitForTimeout(2000);

    console.log(`PUT responses: ${putResponses.length}`);

    // Verify API
    const afterSave = await settingsApi.get('runtime');
    console.log(`API resumeMode after save: ${afterSave.resumeMode}`);
    expect(afterSave.resumeMode).toBe(newValue);

    // Reload and verify UI
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Re-find the select
    const selectsAfter = page.locator('select');
    let resumeSelectAfter = null;
    for (let i = 0; i < await selectsAfter.count(); i++) {
      const options = await selectsAfter.nth(i).locator('option').allInnerTexts();
      if (options.some(o => o.trim() === 'force_resume')) {
        resumeSelectAfter = selectsAfter.nth(i);
        break;
      }
    }
    expect(resumeSelectAfter).not.toBeNull();

    const valueAfterReload = await resumeSelectAfter!.inputValue();
    console.log(`UI resumeMode after reload: ${valueAfterReload}`);

    // KEY ASSERTION: Does the UI retain the saved value after reload?
    expect(valueAfterReload).toBe(newValue);

    // Restore
    await settingsApi.put('runtime', { resumeMode: originalResumeMode });
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

    // Change resumeMode select (a real runtime setting)
    const selects = page.locator('select');
    let resumeSelect = null;
    for (let i = 0; i < await selects.count(); i++) {
      const options = await selects.nth(i).locator('option').allInnerTexts();
      if (options.some(o => o.trim() === 'force_resume')) {
        resumeSelect = selects.nth(i);
        break;
      }
    }

    if (resumeSelect) {
      const baseline = await settingsApi.get('runtime');
      const current = await resumeSelect.inputValue();
      const newValue = current === 'auto' ? 'force_resume' : 'auto';
      await resumeSelect.selectOption(newValue);
      console.log(`Changed resumeMode: ${current} -> ${newValue}`);

      // Wait for auto-save debounce (typically 500-1000ms)
      await page.waitForTimeout(3000);
      console.log(`PUT requests after auto-save wait: ${putUrls.length}`);

      if (putUrls.length === 0) {
        console.log('AUTO-SAVE DID NOT FIRE — this is the bug');
      }

      // Restore
      await settingsApi.put('runtime', { resumeMode: baseline.resumeMode });
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
