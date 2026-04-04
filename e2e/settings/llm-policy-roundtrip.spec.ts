/**
 * LLM policy integration coverage.
 *
 * Keep one API smoke for route registration/persistence and one browser journey
 * that proves the LLM page edits auto-save through the public /llm-policy API.
 */

import { test, expect } from './fixtures.ts';

const API_BASE = 'http://127.0.0.1:8788';

async function setRuntimeAutoSaveEnabled(
  page: import('playwright/test').Page,
  request: import('playwright/test').APIRequestContext,
  expected: boolean,
) {
  const autoSaveButton = page.getByRole('button', { name: /Auto-Save (On|Off)/ }).first();
  await expect(autoSaveButton).toBeVisible();
  const currentEnabled = (((await autoSaveButton.textContent()) || '').trim() === 'Auto-Save On');
  if (currentEnabled !== expected) {
    await autoSaveButton.click();
  }
  await expect(autoSaveButton).toHaveText(expected ? 'Auto-Save On' : 'Auto-Save Off');
  await expect.poll(async () => {
    const res = await request.get(`${API_BASE}/api/v1/ui-settings`);
    const body = await res.json();
    return Boolean(body.runtimeAutoSaveEnabled);
  }).toBe(expected);
}

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
  test('Max Output Tokens auto-saves through /llm-policy and survives reload', async ({ page, request }) => {
    const uiBaselineRes = await request.get(`${API_BASE}/api/v1/ui-settings`);
    const uiBaseline = await uiBaselineRes.json();
    const originalAutoSave = Boolean(uiBaseline.runtimeAutoSaveEnabled);
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
      await setRuntimeAutoSaveEnabled(page, request, true);

      const maxOutputInput = findNumberInput(page, 'Max Output Tokens');
      await expect(maxOutputInput).toBeVisible();

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
      await request.put(`${API_BASE}/api/v1/ui-settings`, {
        data: { runtimeAutoSaveEnabled: originalAutoSave },
      });
    }
  });

  test('Max Output Tokens requires manual Save when runtime auto-save is off', async ({ page, request }) => {
    const uiBaselineRes = await request.get(`${API_BASE}/api/v1/ui-settings`);
    const uiBaseline = await uiBaselineRes.json();
    const originalAutoSave = Boolean(uiBaseline.runtimeAutoSaveEnabled);
    const getRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const baseline = await getRes.json();
    const originalPlanTokens = baseline.policy.tokens.plan;
    const newPlanTokens = originalPlanTokens === 4096 ? 3072 : 4096;
    const llmPutRequests: string[] = [];

    const onRequest = (requestEvent: import('playwright/test').Request) => {
      if (requestEvent.url().includes('/api/v1/llm-policy') && requestEvent.method() === 'PUT') {
        llmPutRequests.push(requestEvent.url());
      }
    };

    page.on('request', onRequest);
    try {
      const loadResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/v1/llm-policy') && response.request().method() === 'GET');

      await page.goto('/#/llm-config');

      const loadResponse = await loadResponsePromise;
      expect(loadResponse.status()).toBe(200);
      await setRuntimeAutoSaveEnabled(page, request, false);

      const maxOutputInput = findNumberInput(page, 'Max Output Tokens');
      await expect(maxOutputInput).toBeVisible();

      const requestCountBeforeEdit = llmPutRequests.length;
      await maxOutputInput.fill(String(newPlanTokens));
      await maxOutputInput.blur();

      await page.waitForTimeout(2_000);
      expect(llmPutRequests.length).toBe(requestCountBeforeEdit);
      await expect.poll(async () => {
        const afterEditRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
        const afterEdit = await afterEditRes.json();
        return afterEdit.policy.tokens.plan;
      }).toBe(originalPlanTokens);

      const saveRequestPromise = page.waitForRequest((requestEvent) =>
        requestEvent.url().includes('/api/v1/llm-policy') && requestEvent.method() === 'PUT');

      await page.getByRole('button', { name: /^Save$/ }).click();

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
      page.off('request', onRequest);
      await request.put(`${API_BASE}/api/v1/llm-policy`, {
        data: baseline.policy,
      });
      await request.put(`${API_BASE}/api/v1/ui-settings`, {
        data: { runtimeAutoSaveEnabled: originalAutoSave },
      });
    }
  });
});
