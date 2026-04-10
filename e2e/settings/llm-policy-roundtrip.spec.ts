/**
 * LLM policy integration coverage.
 *
 * Keep one API smoke for route registration/persistence and one browser journey
 * that proves the LLM page edits persist immediately through the public /llm-policy API.
 */

import { test, expect } from './fixtures.ts';

const API_BASE = 'http://127.0.0.1:8788';

function findNumberInput(page: import('playwright/test').Page, label: string) {
  return page.locator('div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.locator('input[type="number"]') })
    .first()
    .locator('input[type="number"]')
    .first();
}

test.describe('LLM Policy API round-trip', () => {
  test('GET /llm-policy returns ok + policy object', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/llm-policy`);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.policy).toBeDefined();
    expect(body.policy.models).toBeDefined();
    expect(body.policy.tokens).toBeDefined();
  });

  test('PUT /llm-policy persists token changes via GET', async ({ request }) => {
    const getRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const baseline = await getRes.json();
    const originalMaxOutput = baseline.policy.tokens.maxOutput;
    const newMaxOutput = originalMaxOutput === 1400 ? 2000 : 1400;

    const modifiedPolicy = JSON.parse(JSON.stringify(baseline.policy));
    modifiedPolicy.tokens.maxOutput = newMaxOutput;

    const putRes = await request.put(`${API_BASE}/api/v1/llm-policy`, {
      data: modifiedPolicy,
    });
    const putBody = await putRes.json();
    expect(putBody.ok).toBe(true);

    const afterPutRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const afterPut = await afterPutRes.json();
    expect(afterPut.policy.tokens.maxOutput).toBe(newMaxOutput);

    modifiedPolicy.tokens.maxOutput = originalMaxOutput;
    await request.put(`${API_BASE}/api/v1/llm-policy`, { data: modifiedPolicy });
  });
});

test.describe('LLM Config page - UI round-trip', () => {
  test('Max Output Tokens persists immediately on edit and survives reload', async ({ page, request }) => {
    const getRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const baseline = await getRes.json();
    const originalPlanTokens = baseline.policy.tokens.plan;
    const newPlanTokens = originalPlanTokens === 4096 ? 3072 : 4096;

    try {
      const loadResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/v1/llm-policy') && response.request().method() === 'GET');

      await page.goto('/#/llm-config');

      const loadResponse = await loadResponsePromise;
      expect(loadResponse.status()).toBe(200);

      const maxOutputInput = findNumberInput(page, 'Max Output Tokens');
      await expect(maxOutputInput).toBeVisible();

      // WHY: No auto-save toggle needed — LLM config page always persists immediately.
      const saveRequestPromise = page.waitForRequest((requestEvent) =>
        requestEvent.url().includes('/api/v1/llm-policy') && requestEvent.method() === 'PUT');

      await maxOutputInput.fill(String(newPlanTokens));
      await maxOutputInput.blur();

      const saveRequest = await saveRequestPromise;
      expect(saveRequest.postDataJSON()).toMatchObject({
        tokens: { plan: newPlanTokens },
      });

      await expect.poll(async () => {
        const afterSaveRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
        const afterSave = await afterSaveRes.json();
        return afterSave.policy.tokens.plan;
      }).toBe(newPlanTokens);

      await page.reload();
      await expect(findNumberInput(page, 'Max Output Tokens')).toHaveValue(String(newPlanTokens));
    } finally {
      await request.put(`${API_BASE}/api/v1/llm-policy`, {
        data: baseline.policy,
      });
    }
  });

  test('no Save button or Auto-Save toggle exists on LLM config page', async ({ page }) => {
    await page.goto('/#/llm-config');
    // WHY: LLM config page persists on every change — no save button needed.
    await expect(page.getByRole('button', { name: /^Save$/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Save Now/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Auto-Save/ })).not.toBeVisible();
    // Reset button should still exist.
    await expect(page.getByRole('button', { name: /Reset/ })).toBeVisible();
  });
});
