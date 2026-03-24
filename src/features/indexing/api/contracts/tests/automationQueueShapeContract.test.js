// WHY: Verifies that the automation queue builder produces output whose keys
// exactly match the contract shape descriptors. This is the backend half of the
// contract — the alignment test covers the frontend half.

import { describe, it } from 'node:test';
import { ok, deepStrictEqual } from 'node:assert/strict';

import {
  AUTOMATION_JOB_KEYS,
  AUTOMATION_ACTION_KEYS,
  AUTOMATION_SUMMARY_KEYS,
  AUTOMATION_RESPONSE_KEYS,
} from '../automationQueueContract.js';

import { createAutomationQueueBuilder } from '../../builders/automationQueueBuilder.js';

function buildStubContext(overrides = {}) {
  return {
    token: 'test-token',
    category: 'mouse',
    productId: 'mouse-test-product',
    resolvedRunId: 'run-test-001',
    meta: { started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:05:00Z' },
    ...overrides,
  };
}

function stubRepairEvent(ts = '2026-01-01T00:01:00Z') {
  return {
    ts,
    event: 'repair_query_enqueued',
    payload: {
      query: 'test product sensor spec',
      reason: 'missing_evidence',
      field_targets: ['sensor'],
      domain: 'example.com',
      url: 'https://example.com/test',
      doc_hint: 'spec page',
    },
  };
}

function stubDeficitNeedset() {
  return {
    generated_at: '2026-01-01T00:03:00Z',
    rows: [
      {
        field_key: 'weight',
        required_level: 'critical',
        priority_bucket: 'core',
        state: 'missing',
      },
    ],
  };
}

describe('automationQueueShapeContract', () => {

  it('response envelope contains exactly AUTOMATION_RESPONSE_KEYS', async () => {
    const builder = createAutomationQueueBuilder({
      resolveContext: async () => buildStubContext(),
      readEvents: async () => [stubRepairEvent()],
      readNeedSet: async () => stubDeficitNeedset(),
      readSearchProfile: async () => null,
    });

    const result = await builder.readIndexLabRunAutomationQueue('run-test-001');
    ok(result, 'builder returned null');

    const resultKeys = Object.keys(result).sort();
    const contractKeys = [...AUTOMATION_RESPONSE_KEYS].sort();
    deepStrictEqual(resultKeys, contractKeys,
      `response envelope keys mismatch — got [${resultKeys}], expected [${contractKeys}]`);
  });

  it('job rows contain exactly AUTOMATION_JOB_KEYS', async () => {
    const builder = createAutomationQueueBuilder({
      resolveContext: async () => buildStubContext(),
      readEvents: async () => [stubRepairEvent()],
      readNeedSet: async () => ({ rows: [] }),
      readSearchProfile: async () => null,
    });

    const result = await builder.readIndexLabRunAutomationQueue('run-test-001');
    ok(result, 'builder returned null');
    ok(result.jobs.length > 0, 'expected at least one job');

    const jobKeys = Object.keys(result.jobs[0]).sort();
    const contractKeys = [...AUTOMATION_JOB_KEYS].sort();
    deepStrictEqual(jobKeys, contractKeys,
      `job row keys mismatch — got [${jobKeys}], expected [${contractKeys}]`);
  });

  it('action rows contain exactly AUTOMATION_ACTION_KEYS', async () => {
    const builder = createAutomationQueueBuilder({
      resolveContext: async () => buildStubContext(),
      readEvents: async () => [stubRepairEvent()],
      readNeedSet: async () => ({ rows: [] }),
      readSearchProfile: async () => null,
    });

    const result = await builder.readIndexLabRunAutomationQueue('run-test-001');
    ok(result, 'builder returned null');
    ok(result.actions.length > 0, 'expected at least one action');

    const actionKeys = Object.keys(result.actions[0]).sort();
    const contractKeys = [...AUTOMATION_ACTION_KEYS].sort();
    deepStrictEqual(actionKeys, contractKeys,
      `action row keys mismatch — got [${actionKeys}], expected [${contractKeys}]`);
  });

  it('summary contains exactly AUTOMATION_SUMMARY_KEYS', async () => {
    const builder = createAutomationQueueBuilder({
      resolveContext: async () => buildStubContext(),
      readEvents: async () => [stubRepairEvent()],
      readNeedSet: async () => ({ rows: [] }),
      readSearchProfile: async () => null,
    });

    const result = await builder.readIndexLabRunAutomationQueue('run-test-001');
    ok(result, 'builder returned null');
    ok(result.summary, 'summary missing from response');

    const summaryKeys = Object.keys(result.summary).sort();
    const contractKeys = [...AUTOMATION_SUMMARY_KEYS].sort();
    deepStrictEqual(summaryKeys, contractKeys,
      `summary keys mismatch — got [${summaryKeys}], expected [${contractKeys}]`);
  });

  it('nullable job fields emit null, not undefined', async () => {
    const builder = createAutomationQueueBuilder({
      resolveContext: async () => buildStubContext(),
      readEvents: async () => [{
        ts: '2026-01-01T00:01:00Z',
        event: 'repair_query_enqueued',
        payload: { query: 'minimal', reason: 'test', field_targets: [] },
      }],
      readNeedSet: async () => ({ rows: [] }),
      readSearchProfile: async () => null,
    });

    const result = await builder.readIndexLabRunAutomationQueue('run-test-001');
    ok(result?.jobs?.length > 0, 'expected at least one job');
    const job = result.jobs[0];

    const nullableKeys = ['url', 'domain', 'query', 'provider', 'doc_hint',
      'scheduled_at', 'started_at', 'finished_at', 'next_run_at', 'last_error'];
    for (const key of nullableKeys) {
      ok(key in job, `nullable key "${key}" missing from job`);
      if (job[key] === null) {
        ok(true, `${key} is null (correct)`);
      }
      // Non-null is also fine — just asserting key exists and isn't undefined
      ok(job[key] !== undefined, `${key} is undefined — should be null or a value`);
    }
  });
});
