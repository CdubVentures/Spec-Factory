// WHY: Two-phase extraction runner with concurrent support.
//
// CAPTURE phase: runs inside the Crawlee requestHandler with live page access.
//   - Sequential plugins run first (may mutate page state like scroll position).
//   - Concurrent plugins run via Promise.all (read-only CDP commands like screenshot).
//
// TRANSFORM phase: runs after handler closes, no page, no timeout pressure.
//   - Always concurrent (Promise.all) — no shared mutable state, frozen context.
//
// LIFECYCLE plugins (phase: 'lifecycle') are excluded from both phases.
// They are wired into Crawlee's browser pool hooks by crawlSession, not the runner.

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

async function runPhase(plugins, ctx, logger, { forceConcurrent = false } = {}) {
  if (!plugins.length) return {};

  const frozenCtx = freezePlainContext({ ...ctx });
  const results = {};

  const sequential = forceConcurrent ? [] : plugins.filter((p) => !p.concurrent);
  const concurrent = forceConcurrent ? plugins : plugins.filter((p) => p.concurrent);

  // Sequential first (may mutate page state like scroll position for stitching)
  for (const plugin of sequential) {
    try {
      const result = await plugin.onExtract(frozenCtx);
      results[plugin.name] = result;
      const summary = typeof plugin.summarize === 'function' ? plugin.summarize(result) : {};
      logger?.info?.('extraction_plugin_completed', {
        plugin: plugin.name,
        worker_id: ctx.workerId,
        url: ctx.url,
        result: summary,
      });
    } catch (err) {
      logger?.error?.('extraction_plugin_failed', {
        plugin: plugin.name,
        reason: err?.message ?? String(err),
        worker_id: ctx.workerId,
        url: ctx.url,
      });
    }
  }

  // Concurrent batch (independent operations, no shared mutation)
  if (concurrent.length > 0) {
    const settled = await Promise.allSettled(
      concurrent.map(async (plugin) => {
        try {
          const result = await plugin.onExtract(frozenCtx);
          const summary = typeof plugin.summarize === 'function' ? plugin.summarize(result) : {};
          logger?.info?.('extraction_plugin_completed', {
            plugin: plugin.name,
            worker_id: ctx.workerId,
            url: ctx.url,
            result: summary,
          });
          return { name: plugin.name, result };
        } catch (err) {
          logger?.error?.('extraction_plugin_failed', {
            plugin: plugin.name,
            reason: err?.message ?? String(err),
            worker_id: ctx.workerId,
            url: ctx.url,
          });
          throw err;
        }
      }),
    );
    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        results[entry.value.name] = entry.value.result;
      }
    }
  }

  return results;
}

export function createExtractionRunner({ plugins = [], logger } = {}) {
  const capturePlugins = plugins.filter((p) => (p.phase || 'capture') === 'capture');
  const transformPlugins = plugins.filter((p) => p.phase === 'transform');

  async function runCaptures(ctx) {
    return runPhase(capturePlugins, ctx, logger);
  }

  // WHY: Transform phase always runs concurrently — no page, no shared state.
  // The forceConcurrent flag overrides individual plugin concurrent settings.
  async function runTransforms(ctx) {
    return runPhase(transformPlugins, ctx, logger, { forceConcurrent: true });
  }

  // WHY: Backward compat — existing callers use runExtractions.
  // Equivalent to runCaptures (capture-phase only).
  async function runExtractions(ctx) {
    return runCaptures(ctx);
  }

  return { runCaptures, runTransforms, runExtractions };
}
