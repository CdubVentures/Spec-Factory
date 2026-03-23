/**
 * Shared Playwright fixtures for settings E2E tests.
 *
 * WHY: Every settings test needs the same API helpers and page utilities.
 * This file provides them as reusable fixtures so test files stay focused
 * on the assertion logic.
 */

import { test as base, expect, type APIRequestContext } from 'playwright/test';

const API_BASE = 'http://localhost:8788';

// --- API helper types ---

interface SettingsApiHelper {
  get: (domain: string) => Promise<Record<string, unknown>>;
  put: (domain: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

// --- Fixtures ---

export const test = base.extend<{
  settingsApi: SettingsApiHelper;
}>({
  settingsApi: async ({ request }, use) => {
    const helper: SettingsApiHelper = {
      async get(domain: string) {
        const res = await request.get(`${API_BASE}/api/v1/${domain}-settings`);
        expect(res.ok(), `GET /api/v1/${domain}-settings failed: ${res.status()}`).toBe(true);
        return res.json();
      },
      async put(domain: string, body: Record<string, unknown>) {
        const res = await request.put(`${API_BASE}/api/v1/${domain}-settings`, {
          data: body,
        });
        return res.json();
      },
    };
    await use(helper);
  },
});

export { expect };
