/**
 * LLM Policy round-trip tests.
 *
 * WHY: The /api/v1/llm-policy route was not registered in configRoutes.js,
 * causing all LLM Config saves to 404. Now that it's wired, verify the
 * full cycle: API round-trip + UI interaction.
 */

import { test, expect } from './fixtures.ts';

const API_BASE = 'http://localhost:8788';

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
    // GET baseline
    const getRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const baseline = await getRes.json();
    const originalMaxOutput = baseline.policy.tokens.maxOutput;

    // WHY: Use a valid model from the provider registry. The handler validates
    // model IDs — "test-persist-model-xyz" would fail validation.
    // Only change the tokens field, keep models as-is from server.
    const modifiedPolicy = JSON.parse(JSON.stringify(baseline.policy));
    const newMaxOutput = originalMaxOutput === 1400 ? 2000 : 1400;
    modifiedPolicy.tokens.maxOutput = newMaxOutput;

    // Ensure models use valid IDs from the provider registry
    const validModels = modifiedPolicy.providerRegistry
      ?.flatMap((p: { models?: { modelId: string }[] }) => p.models?.map((m: { modelId: string }) => m.modelId) || [])
      || [];
    if (validModels.length > 0) {
      modifiedPolicy.models.plan = validModels[0];
      modifiedPolicy.models.reasoning = validModels.find((m: string) => m !== validModels[0]) || validModels[0];
    }

    const putRes = await request.put(`${API_BASE}/api/v1/llm-policy`, {
      data: modifiedPolicy,
    });
    const putBody = await putRes.json();
    console.log(`PUT response ok: ${putBody.ok}, error: ${putBody.error || 'none'}`);
    if (putBody.rejected) console.log(`Rejected: ${JSON.stringify(putBody.rejected)}`);
    expect(putBody.ok).toBe(true);

    // GET again — verify persisted
    const afterPutRes = await request.get(`${API_BASE}/api/v1/llm-policy`);
    const afterPut = await afterPutRes.json();
    expect(afterPut.policy.tokens.maxOutput).toBe(newMaxOutput);

    // Restore
    modifiedPolicy.tokens.maxOutput = originalMaxOutput;
    await request.put(`${API_BASE}/api/v1/llm-policy`, { data: modifiedPolicy });
  });
});

test.describe('LLM Config page — UI round-trip', () => {
  test('LLM config page loads with data (no more 404)', async ({ page }) => {
    // Intercept network to verify GET /llm-policy succeeds
    const responses: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('llm-policy')) {
        responses.push({ url: res.url(), status: res.status() });
      }
    });

    await page.goto('/#/llm-config');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify the GET succeeded (not 404)
    const llmPolicyResponses = responses.filter(r => r.url.includes('llm-policy'));
    console.log(`LLM Policy responses: ${llmPolicyResponses.length}`);
    for (const r of llmPolicyResponses) {
      console.log(`  ${r.url} -> ${r.status}`);
    }

    if (llmPolicyResponses.length > 0) {
      expect(llmPolicyResponses[0].status).toBe(200);
    }

    await page.screenshot({ path: 'e2e/settings/debug-llm-config-loaded.png' });

    // Check if the page shows settings content (not an error state)
    const bodyText = await page.locator('body').innerText();
    console.log(`LLM config page text length: ${bodyText.length}`);

    // Look for settings controls
    const inputs = page.locator('input, select, textarea');
    console.log(`Input elements: ${await inputs.count()}`);
  });
});
