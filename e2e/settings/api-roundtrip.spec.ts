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
    // fetchConcurrency is a registry-derived int field that must always be present
    expect(snapshot).toHaveProperty('fetchConcurrency');
  });

  test('PUT valid int -> GET returns updated value', async ({ settingsApi }) => {
    // Record baseline
    const baseline = await settingsApi.get('runtime');
    const originalValue = baseline.fetchConcurrency;

    // Choose a value different from current
    const newValue = originalValue === 8 ? 16 : 8;

    // PUT
    const putResult = await settingsApi.put('runtime', { fetchConcurrency: newValue });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty('fetchConcurrency', newValue);

    // GET — must return updated value
    const afterPut = await settingsApi.get('runtime');
    expect(afterPut.fetchConcurrency).toBe(newValue);

    // Restore original
    await settingsApi.put('runtime', { fetchConcurrency: originalValue });
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
    const key = 'repairDedupeRule';
    const originalValue = baseline[key];

    // Pick a different valid enum value
    const newValue = originalValue === 'domain_once' ? 'none' : 'domain_once';
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
    expect(snapshot).toHaveProperty('storageAutoSaveEnabled');
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

// ---------------------------------------------------------------------------
// Storage settings
// ---------------------------------------------------------------------------

test.describe('Storage settings API round-trip', () => {
  test('GET /storage-settings returns storage fields', async ({ settingsApi }) => {
    const snapshot = await settingsApi.get('storage');
    expect(snapshot).toHaveProperty('enabled');
    expect(snapshot).toHaveProperty('destinationType');
    expect(snapshot).toHaveProperty('localDirectory');
  });

  test('PUT valid fields -> GET returns updated values', async ({ settingsApi }) => {
    const baseline = await settingsApi.get('storage');
    const originalEnabled = baseline.enabled;

    const newEnabled = !originalEnabled;
    const putResult = await settingsApi.put('storage', { enabled: newEnabled });
    expect(putResult.ok).toBe(true);
    expect(putResult.applied).toHaveProperty('enabled', newEnabled);

    const afterPut = await settingsApi.get('storage');
    expect(afterPut.enabled).toBe(newEnabled);

    // Restore
    await settingsApi.put('storage', { enabled: originalEnabled });
  });
});

