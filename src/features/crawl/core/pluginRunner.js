/**
 * Plugin lifecycle runner.
 * Iterates plugins in registration order, calling the named hook on each.
 * Errors in individual plugins are caught and logged — never crash the pipeline.
 */

export function createPluginRunner({ plugins = [], logger } = {}) {
  async function runHook(hookName, context) {
    for (const plugin of plugins) {
      const hookFn = plugin?.hooks?.[hookName];
      if (typeof hookFn !== 'function') continue;
      try {
        await hookFn(context);
      } catch (err) {
        logger?.warn?.('plugin_hook_error', {
          plugin: plugin.name ?? 'unknown',
          hook: hookName,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  return { runHook };
}
