import test from 'node:test';
import assert from 'node:assert/strict';

import { createBillingReportCommand } from '../../../../src/app/cli/commands/billingReportCommand.js';

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

test('billing-report forwards explicit month/config/storage to builder and returns payload', async () => {
  const calls = [];
  const commandBillingReport = createBillingReportCommand(createDeps({
    buildBillingReport: async (payload) => {
      calls.push(payload);
      return {
        month: payload.month,
        total_cost_usd: 45.67,
        line_items: 8,
      };
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await commandBillingReport(config, storage, { month: '2026-02' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config, config);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].month, '2026-02');

  assert.equal(result.command, 'billing-report');
  assert.equal(result.month, '2026-02');
  assert.equal(result.total_cost_usd, 45.67);
  assert.equal(result.line_items, 8);
});

test('billing-report defaults month when not provided', async () => {
  const calls = [];
  const commandBillingReport = createBillingReportCommand(createDeps({
    buildBillingReport: async (payload) => {
      calls.push(payload);
      return { month: payload.month, total_cost_usd: 0 };
    },
  }));

  const result = await commandBillingReport({}, {}, {});

  assert.equal(calls.length, 1);
  assert.match(calls[0].month, /^\d{4}-\d{2}$/);
  assert.equal(result.command, 'billing-report');
  assert.match(result.month, /^\d{4}-\d{2}$/);
});
