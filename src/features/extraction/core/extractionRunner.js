// WHY: Sequential extraction runner — executes extraction plugins one at a time
// in registration order via for-of await. Each plugin receives a frozen
// read-only context. Sequential execution prevents DOM-state race conditions
// when plugins share a Playwright page object. One failing plugin does not
// affect others (try/catch per plugin).

function isPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezePlainContext(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }

  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) {
    freezePlainContext(entry, seen);
  }
  return Object.freeze(value);
}

export function createExtractionRunner({ plugins = [], logger } = {}) {
  async function runExtractions(ctx) {
    if (!plugins.length) return {};

    // BUG: shallow-freezing the wrapper left nested plain objects like
    // settings mutable across plugins, violating the read-only context contract.
    const frozenCtx = freezePlainContext({ ...ctx });
    const extractions = {};

    for (const plugin of plugins) {
      try {
        const result = await plugin.onExtract(frozenCtx);
        logger?.info?.('extraction_plugin_completed', {
          plugin: plugin.name,
          worker_id: ctx.workerId,
          url: ctx.url,
        });
        extractions[plugin.name] = result;
      } catch (err) {
        logger?.error?.('extraction_plugin_failed', {
          plugin: plugin.name,
          reason: err?.message ?? String(err),
          worker_id: ctx.workerId,
          url: ctx.url,
        });
      }
    }

    return extractions;
  }

  return { runExtractions };
}
