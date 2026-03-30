/**
 * API-only settings round-trip tests.
 *
 * WHY: Isolates the backend from the frontend. If these fail, the bug is
 * in the server handlers or persistence layer. If these pass but UI tests
 * fail, the bug is in the frontend save/hydration flow.
 *
 * No browser required — uses Playwright's APIRequestContext directly.
 */

import { test, expect } from './fixtures.ts';

// ---------------------------------------------------------------------------
// Runtime settings
// ---------------------------------------------------------------------------

test.describe('Runtime settings API round-trip', () => {
  test('GET /runtime-settings returns a snapshot object', async ({ settingsApi }) => {
    const snapshot = await settingsApi.get('runtime');
    expect(typeof snapshot).toBe('object');
    expect(snapshot).toHaveProperty('crawlMaxConcurrentSlots');
  });

  test('PUT valid int -> GET returns updated value', async ({ settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const originalValue = baseline.crawlMaxConcurrentSlots;

    const newValue = originalValue === 4 ? 6 : 4;

    const putResult = await settingsApi.put('runtime', { crawlMaxConcurrentSlots: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty('crawlMaxConcurrentSlots', newValue);

    const afterPut = await settingsApi.get('runtime');
    expect(afterPut.crawlMaxConcurrentSlots).toBe(newValue);

    await settingsApi.put('runtime', { crawlMaxConcurrentSlots: originalValue });
  });

  test('PUT valid bool -> GET returns updated value', async ({ settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const key = 'autoScrollEnabled';
    const originalValue = baseline[key];

    const newValue = !originalValue;
    const putResult = await settingsApi.put('runtime', { [key]: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty(key, newValue);

    const afterPut = await settingsApi.get('runtime');
    expect(afterPut[key]).toBe(newValue);

    // Restore
    await settingsApi.put('runtime', { [key]: originalValue });
  });

  test('PUT unknown key is rejected', async ({ settingsApi }) => {
    const putResult = await settingsApi.put('runtime', { totallyBogusKey: 42 });
    expect(putResult.ok).toBe(true); // overall save succeeds
    expect(putResult.rejected).toHaveProperty('totallyBogusKey', 'unknown_key');
  });

  test('PUT valid enum -> GET returns updated value', async ({ settingsApi }) => {
    const baseline = await settingsApi.get('runtime');
    const key = 'pipelineSchemaEnforcementMode';
    const originalValue = baseline[key];

    // Pick a different valid enum value
    const newValue = originalValue === 'off' ? 'warn' : 'off';
    const putResult = await settingsApi.put('runtime', { [key]: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty(key, newValue);

    const afterPut = await settingsApi.get('runtime');
    expect(afterPut[key]).toBe(newValue);

    // Restore
    await settingsApi.put('runtime', { [key]: originalValue });
  });
});

// ---------------------------------------------------------------------------
// UI settings
// ---------------------------------------------------------------------------

test.describe('UI settings API round-trip', () => {
  test('GET /ui-settings returns all boolean fields', async ({ settingsApi }) => {
    const snapshot = await settingsApi.get('ui');
    expect(snapshot).toHaveProperty('studioAutoSaveAllEnabled');
    expect(snapshot).toHaveProperty('studioAutoSaveEnabled');
    expect(snapshot).toHaveProperty('studioAutoSaveMapEnabled');
    expect(snapshot).toHaveProperty('runtimeAutoSaveEnabled');
  });

  test('PUT valid bool -> GET returns updated value', async ({ settingsApi }) => {
    const baseline = await settingsApi.get('ui');
    const key = 'runtimeAutoSaveEnabled';
    const originalValue = baseline[key];

    const newValue = !originalValue;
    const putResult = await settingsApi.put('ui', { [key]: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty(key, newValue);

    const afterPut = await settingsApi.get('ui');
    expect(afterPut[key]).toBe(newValue);

    // Restore
    await settingsApi.put('ui', { [key]: originalValue });
  });

  test('PUT unknown key is rejected', async ({ settingsApi }) => {
    const putResult = await settingsApi.put('ui', { fakeUiSetting: true });
    expect(putResult.ok).toBe(true);
    expect(putResult.rejected).toHaveProperty('fakeUiSetting', 'unknown_key');
  });
});


