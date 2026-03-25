// WHY: Concurrent extraction runner — fires all extraction plugins in parallel
// via Promise.allSettled. Each plugin receives a frozen read-only context so
// concurrent plugins cannot mutate shared state. One failing plugin does not
// affect others.

export function createExtractionRunner({ plugins = [], logger } = {}) {
  async function runExtractions(ctx) {
    if (!plugins.length) return {};

    const frozenCtx = Object.freeze({ ...ctx });

    const settled = await Promise.allSettled(
      plugins.map(async (plugin) => {
        const result = await plugin.onExtract(frozenCtx);
        logger?.info?.('extraction_plugin_completed', {
          plugin: plugin.name,
          worker_id: ctx.workerId,
          url: ctx.url,
        });
        return { name: plugin.name, data: result };
      }),
    );

    const extractions = {};
    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        extractions[entry.value.name] = entry.value.data;
      } else {
        logger?.error?.('extraction_plugin_failed', {
          reason: entry.reason?.message,
          worker_id: ctx.workerId,
        });
      }
    }
    return extractions;
  }

  return { runExtractions };
}
