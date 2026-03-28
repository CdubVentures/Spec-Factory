import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFetchSuiteLoop } from '../core/suiteOrchestrator.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createRunnerDouble() {
  const hookCalls = [];
  return {
    hookCalls,
    async runHook(hookName, ctx) {
      hookCalls.push({ hook: hookName, mode: 'sequential' });
    },
    async runHookConcurrent(hookName, ctx) {
      hookCalls.push({ hook: hookName, mode: 'concurrent' });
    },
  };
}

function createPageDouble() {
  const waitedMs = [];
  return {
    waitedMs,
    async waitForTimeout(ms) { waitedMs.push(ms); },
  };
}

function defaultSettings(overrides = {}) {
  return {
    fetchLoadingDelayMs: 0,     // No delay in tests for speed
    fetchDismissRounds: 2,
    fetchSuiteMode: 'sequential',
    ...overrides,
  };
}

function createCtx(pageOverrides = {}) {
  const page = createPageDouble(pageOverrides);
  return { page, request: {}, settings: {}, workerId: 'fetch-1' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runFetchSuiteLoop', () => {

  describe('contract', () => {
    it('returns a telemetry object', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      const result = await runFetchSuiteLoop({
        runner, settings: defaultSettings(), ctx,
      });
      assert.equal(typeof result.rounds, 'number');
      assert.equal(typeof result.loadingDelayMs, 'number');
      assert.equal(typeof result.suiteMode, 'string');
      assert.equal(typeof result.fetchWindowStartMs, 'number');
      assert.equal(typeof result.fetchWindowEndMs, 'number');
      assert.ok(result.fetchWindowEndMs >= result.fetchWindowStartMs);
    });
  });

  describe('loading delay', () => {
    it('waits fetchLoadingDelayMs before first dismiss', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchLoadingDelayMs: 3000 }), ctx,
      });
      assert.equal(ctx.page.waitedMs[0], 3000);
    });

    it('skips delay when fetchLoadingDelayMs is 0', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchLoadingDelayMs: 0 }), ctx,
      });
      assert.ok(!ctx.page.waitedMs.includes(3000));
    });
  });

  describe('round loop — dismiss/scroll interleaving', () => {
    it('fires dismiss before first scroll (round 0)', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchDismissRounds: 1 }), ctx,
      });
      assert.equal(runner.hookCalls[0].hook, 'onDismiss');
    });

    it('interleaves scroll and dismiss for each round', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchDismissRounds: 2 }), ctx,
      });
      // Expected: dismiss, scroll, dismiss, scroll, dismiss
      const hooks = runner.hookCalls.map((c) => c.hook);
      assert.deepEqual(hooks, ['onDismiss', 'onScroll', 'onDismiss', 'onScroll', 'onDismiss']);
    });

    it('fires dismiss→scroll→dismiss for 1 round', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchDismissRounds: 1 }), ctx,
      });
      const hooks = runner.hookCalls.map((c) => c.hook);
      assert.deepEqual(hooks, ['onDismiss', 'onScroll', 'onDismiss']);
    });

    it('fires 3 rounds correctly', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchDismissRounds: 3 }), ctx,
      });
      const hooks = runner.hookCalls.map((c) => c.hook);
      // dismiss, scroll, dismiss, scroll, dismiss, scroll, dismiss
      assert.deepEqual(hooks, [
        'onDismiss', 'onScroll', 'onDismiss', 'onScroll', 'onDismiss', 'onScroll', 'onDismiss',
      ]);
    });

    it('returns correct round count', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      const result = await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchDismissRounds: 3 }), ctx,
      });
      assert.equal(result.rounds, 3);
    });
  });

  describe('suite mode', () => {
    it('uses runHook (sequential) by default', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchSuiteMode: 'sequential' }), ctx,
      });
      const dismissCalls = runner.hookCalls.filter((c) => c.hook === 'onDismiss');
      assert.ok(dismissCalls.every((c) => c.mode === 'sequential'));
    });

    it('uses runHookConcurrent when mode is concurrent', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchSuiteMode: 'concurrent' }), ctx,
      });
      const dismissCalls = runner.hookCalls.filter((c) => c.hook === 'onDismiss');
      assert.ok(dismissCalls.every((c) => c.mode === 'concurrent'));
    });

    it('always runs onScroll sequentially regardless of mode', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      await runFetchSuiteLoop({
        runner, settings: defaultSettings({ fetchSuiteMode: 'concurrent' }), ctx,
      });
      const scrollCalls = runner.hookCalls.filter((c) => c.hook === 'onScroll');
      assert.ok(scrollCalls.every((c) => c.mode === 'sequential'));
    });
  });

  describe('error resilience', () => {
    it('does not crash when runner.runHook throws', async () => {
      const runner = {
        async runHook() { throw new Error('hook failed'); },
        async runHookConcurrent() { throw new Error('hook failed'); },
      };
      const ctx = createCtx();
      const result = await runFetchSuiteLoop({
        runner, settings: defaultSettings(), ctx,
      });
      assert.equal(typeof result.rounds, 'number');
    });
  });

  describe('defaults', () => {
    it('uses default values when settings are undefined', async () => {
      const runner = createRunnerDouble();
      const ctx = createCtx();
      const result = await runFetchSuiteLoop({ runner, settings: {}, ctx });
      // Default fetchDismissRounds=2, so 5 hook calls: dismiss, scroll, dismiss, scroll, dismiss
      assert.equal(result.rounds, 2);
    });
  });
});
