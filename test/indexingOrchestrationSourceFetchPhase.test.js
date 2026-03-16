import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeEmitRepairQuery, runSourceFetchPhase } from '../src/features/indexing/orchestration/index.js';


test('runSourceFetchPhase routes static manual-style sources through http when the source does not require JS', async () => {
  const requestedModes = [];

  const result = await runSourceFetchPhase({
    workerId: 'fetch-static-manual',
    source: {
      url: 'https://www.manua.ls/logitech/g-pro-x-superlight-2-dex/manual',
      host: 'manua.ls',
      role: 'other',
      requires_js: false
    },
    sourceHost: 'manua.ls',
    hostBudgetRow: { started_count: 0, completed_count: 0 },
    fetchWithModeFn: async (source, mode) => {
      requestedModes.push(mode);
      return {
        status: 200,
        html: '<html>manual</html>',
        fetchTelemetry: {
          fetcher_kind: mode
        }
      };
    },
    fetcherMode: 'playwright',
    config: { sourceFetchWrapperAttempts: 1, sourceFetchWrapperBackoffMs: 0 },
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    fetchHostConcurrencyGate: {
      run: async ({ task }) => task()
    },
    runWithRetryFn: async (task) => task(),
    classifyFetchOutcomeFn: () => 'ok',
    bumpHostOutcomeFn() {},
    applyHostBudgetBackoffFn() {},
    resolveHostBudgetStateFn: () => ({ score: 10, state: 'open' }),
    maybeApplyBlockedDomainCooldownFn() {},
  });

  assert.equal(result.ok, true);
  assert.equal(requestedModes[0], 'http');
});
