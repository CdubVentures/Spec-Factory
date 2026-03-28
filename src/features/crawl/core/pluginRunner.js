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
        const result = await hookFn(context);
        if (result !== undefined) {
          logger?.info?.('plugin_hook_completed', {
            plugin: plugin.name ?? 'unknown',
            hook: hookName,
            worker_id: context?.workerId || '',
            result,
          });
        }
      } catch (err) {
        logger?.warn?.('plugin_hook_error', {
          plugin: plugin.name ?? 'unknown',
          hook: hookName,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  // WHY: Same contract as runHook but fires all matching plugins concurrently
  // via Promise.allSettled. Used when fetchSuiteMode === 'concurrent'.
  async function runHookConcurrent(hookName, context) {
    const promises = plugins
      .filter((p) => typeof p?.hooks?.[hookName] === 'function')
      .map(async (plugin) => {
        try {
          const result = await plugin.hooks[hookName](context);
          if (result !== undefined) {
            logger?.info?.('plugin_hook_completed', {
              plugin: plugin.name ?? 'unknown',
              hook: hookName,
              worker_id: context?.workerId || '',
              result,
            });
          }
        } catch (err) {
          logger?.warn?.('plugin_hook_error', {
            plugin: plugin.name ?? 'unknown',
            hook: hookName,
            error: err?.message ?? String(err),
          });
        }
      });
    await Promise.allSettled(promises);
  }

  return { runHook, runHookConcurrent };
}
