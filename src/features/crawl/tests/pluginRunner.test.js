import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPluginRunner } from '../core/pluginRunner.js';
import {
  createLoggerSpy,
  createPluginDouble,
} from './factories/crawlTestDoubles.js';

describe('createPluginRunner', () => {
  describe('contract', () => {
    it('returns an object with runHook function', () => {
      const runner = createPluginRunner({ plugins: [] });
      assert.equal(typeof runner.runHook, 'function');
    });
  });

  describe('runHook', () => {
    it('calls both plugins in registration order', async () => {
      const calls = [];
      const pluginA = createPluginDouble({
        name: 'a',
        hooks: { beforeNavigate: async () => { calls.push('a'); } },
      });
      const pluginB = createPluginDouble({
        name: 'b',
        hooks: { beforeNavigate: async () => { calls.push('b'); } },
      });
      const runner = createPluginRunner({ plugins: [pluginA, pluginB] });
      await runner.runHook('beforeNavigate', {});
      assert.deepEqual(calls, ['a', 'b']);
    });

    it('skips plugin missing the requested hook', async () => {
      const calls = [];
      const pluginNoHook = createPluginDouble({
        name: 'noHook',
        hooks: { onInteract: async () => { calls.push('onInteract'); } },
      });
      const pluginWithHook = createPluginDouble({
        name: 'withHook',
        hooks: { afterNavigate: async () => { calls.push('afterNavigate'); } },
      });
      const runner = createPluginRunner({ plugins: [pluginNoHook, pluginWithHook] });
      await runner.runHook('afterNavigate', {});
      assert.deepEqual(calls, ['afterNavigate']);
    });

    it('catches plugin error and continues to next plugin', async () => {
      const calls = [];
      const { logger, warnCalls } = createLoggerSpy();
      const pluginBad = createPluginDouble({
        name: 'bad',
        hooks: { beforeNavigate: async () => { throw new Error('boom'); } },
      });
      const pluginGood = createPluginDouble({
        name: 'good',
        hooks: { beforeNavigate: async () => { calls.push('good'); } },
      });
      const runner = createPluginRunner({ plugins: [pluginBad, pluginGood], logger });
      await runner.runHook('beforeNavigate', {});
      assert.deepEqual(calls, ['good']);
      assert.equal(warnCalls.length, 1);
      assert.equal(warnCalls[0].event, 'plugin_hook_error');
      assert.equal(warnCalls[0].plugin, 'bad');
    });

    it('no-ops with empty plugin list', async () => {
      const runner = createPluginRunner({ plugins: [] });
      await runner.runHook('beforeNavigate', {});
      // no error thrown
    });

    it('skips plugin with null hooks gracefully', async () => {
      const calls = [];
      const pluginBadHooks = { name: 'bad', hooks: null };
      const pluginGood = createPluginDouble({
        name: 'good',
        hooks: { beforeNavigate: async () => { calls.push('good'); } },
      });
      const runner = createPluginRunner({ plugins: [pluginBadHooks, pluginGood] });
      await runner.runHook('beforeNavigate', {});
      assert.deepEqual(calls, ['good']);
    });

    it('passes context mutations from first plugin to second', async () => {
      const seen = [];
      const pluginFirst = createPluginDouble({
        name: 'first',
        hooks: { beforeNavigate: async (ctx) => { ctx.foo = 42; } },
      });
      const pluginSecond = createPluginDouble({
        name: 'second',
        hooks: { beforeNavigate: async (ctx) => { seen.push(ctx.foo); } },
      });
      const runner = createPluginRunner({ plugins: [pluginFirst, pluginSecond] });
      await runner.runHook('beforeNavigate', {});
      assert.deepEqual(seen, [42]);
    });

    it('swallows errors silently when no logger provided', async () => {
      const calls = [];
      const pluginBad = createPluginDouble({
        name: 'bad',
        hooks: { beforeNavigate: async () => { throw new Error('boom'); } },
      });
      const pluginGood = createPluginDouble({
        name: 'good',
        hooks: { beforeNavigate: async () => { calls.push('good'); } },
      });
      const runner = createPluginRunner({ plugins: [pluginBad, pluginGood] });
      await runner.runHook('beforeNavigate', {});
      assert.deepEqual(calls, ['good']);
    });
  });
});
