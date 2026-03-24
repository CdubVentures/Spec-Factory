import test from 'node:test';
import assert from 'node:assert/strict';

import { createBillingReportCommand } from '../billingReportCommand.js';

function createDeps(overrides = {}) {
  return {
    buildBillingReport: async ({ storage, month, config }) => ({
      storageName: storage?.name || null,
      month,
      mode: config?.mode || 'unknown',
      total_cost_usd: 12.34,
    }),
    ...overrides,
  };
}

test('billing-report returns the explicit month in its command payload', async () => {
  const commandBillingReport = createBillingReportCommand(createDeps({
    buildBillingReport: async ({ month }) => ({
      month,
      total_cost_usd: 45.67,
      line_items: 8,
    }),
  }));

  const result = await commandBillingReport(
    { mode: 'test' },
    { name: 'stub-storage' },
    { month: '2026-02' },
  );

  assert.deepEqual(result, {
    command: 'billing-report',
    month: '2026-02',
    total_cost_usd: 45.67,
    line_items: 8,
  });
});

test('billing-report defaults month when it is not provided', async () => {
  const commandBillingReport = createBillingReportCommand(createDeps({
    buildBillingReport: async ({ month }) => ({
      month,
      total_cost_usd: 0,
    }),
  }));

  const result = await commandBillingReport({}, {}, {});

  assert.equal(result.command, 'billing-report');
  assert.match(result.month, /^\d{4}-\d{2}$/);
  assert.equal(result.total_cost_usd, 0);
});
