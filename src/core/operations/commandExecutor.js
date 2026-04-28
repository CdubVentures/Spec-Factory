/**
 * Command Executor — generic in-process command execution engine.
 *
 * Looks up a command in COMMAND_REGISTRY, acquires a per-category mutex
 * if needed, registers an operation in the operations tracker, calls the
 * handler function, runs post-completion hooks, and marks the operation
 * done or failed.
 *
 * The frontend tracks progress via the existing operations WS channel.
 */

import { COMMAND_REGISTRY_MAP } from './commandRegistry.js';
import { acquireCategoryLock } from './categoryMutex.js';
import {
  registerOperation,
  updateStage,
  completeOperation,
  failOperation,
} from './operationsRegistry.js';

function assertCommandSucceeded(result) {
  if (!result || result.compiled !== false) return;
  const errors = Array.isArray(result.errors)
    ? result.errors.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  throw new Error(errors.length > 0 ? errors.join('; ') : 'compile_failed');
}

/**
 * Execute a registered command in-process.
 *
 * @param {object} opts
 * @param {string} opts.type — registry key ('compile', 'validate')
 * @param {string} opts.category
 * @param {object} opts.config — server config
 * @param {object} opts.deps — DI bag (sessionCache, specDb, broadcastWs, etc.)
 * @param {Function} [opts._handlerOverride] — test seam: skip dynamic import
 * @param {Function} [opts._postCompleteOverride] — test seam: skip dynamic import
 * @returns {Promise<{ operationId?: string, error?: string }>}
 */
export async function executeCommand({ type, category, config, deps, _handlerOverride, _postCompleteOverride }) {
  const entry = COMMAND_REGISTRY_MAP[type];
  if (!entry) throw new Error(`Unknown command type: "${type}"`);

  // WHY: Per-category mutex prevents write conflicts (compile + validate on same category)
  let release = null;
  if (entry.mutatesCategory) {
    const lock = acquireCategoryLock(category);
    if (!lock.acquired) return { error: 'category_busy' };
    release = lock.release;
  }

  const { id: operationId } = registerOperation({
    type: entry.type,
    category,
    stages: entry.stages,
  });

  try {
    updateStage({ id: operationId, stageName: entry.stages[0] });

    // Resolve handler
    const handler = _handlerOverride || await resolveExport(entry.handlerModule, entry.handlerExport);
    const result = await handler({ category, config });
    assertCommandSucceeded(result);

    // Post-completion hook (best-effort — failure does not fail the operation)
    if (entry.stages.length > 1) {
      updateStage({ id: operationId, stageName: entry.stages[entry.stages.length - 1] });
    }

    completeOperation({ id: operationId });

    const postComplete = _postCompleteOverride || (entry.postCompleteModule
      ? await resolveExport(entry.postCompleteModule, entry.postCompleteExport)
      : null);
    if (postComplete) {
      try {
        await postComplete({ category, result, deps });
      } catch (_postErr) {
        // WHY: Post-complete is best-effort. The compile itself succeeded.
      }
    }

    return { operationId };
  } catch (err) {
    failOperation({ id: operationId, error: err?.message || String(err) });
    return { operationId };
  } finally {
    if (release) release();
  }
}

async function resolveExport(modulePath, exportName) {
  const mod = await import(modulePath);
  if (typeof mod[exportName] !== 'function') {
    throw new Error(`Export "${exportName}" not found in ${modulePath}`);
  }
  return mod[exportName];
}
