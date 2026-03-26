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

async function withMockedDate(isoString, run) {
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [isoString]));
    }

    static now() {
      return new RealDate(isoString).valueOf();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }

  global.Date = MockDate;
  try {
    return await run();
  } finally {
    global.Date = RealDate;
  }
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
  const billingCalls = [];
  const commandBillingReport = createBillingReportCommand(createDeps({
    buildBillingReport: async ({ storage, month, config }) => {
      billingCalls.push({ storage, month, config });
      return ({
      month,
      total_cost_usd: 0,
    });
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await withMockedDate('2026-03-25T20:40:00.000Z', () =>
    commandBillingReport(config, storage, {})
  );

  assert.deepEqual(result, {
    command: 'billing-report',
    month: '2026-03',
    total_cost_usd: 0,
  });
  assert.deepEqual(billingCalls, [{
    storage,
    month: '2026-03',
    config,
  }]);
});
