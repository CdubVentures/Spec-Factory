// ── Category Seed Engine ─────────────────────────────────────────────────────
// WHY: Generic orchestration loop for category seed surfaces. Iterates
// surfaces in dependency order, calls before → execute → after → summarize
// on each, and aggregates results. Hard-fail semantics: any throw propagates.
//
// The engine knows nothing about field-rules, JSON I/O, or hash-gating.
// It receives pre-computed context and surfaces as parameters.

import { topologicalSort } from './seedRegistry.js';

export async function runCategorySeed({ db, config, category, fieldRules, fieldMeta, logger, surfaces }) {
  const start = Date.now();
  const ctx = { db, config, category, fieldRules, fieldMeta, logger };
  const sorted = topologicalSort(surfaces);
  const errors = [];
  const summaries = {};

  for (const surface of sorted) {
    const beforeResult = surface.before ? (await surface.before(ctx)) ?? null : null;
    const result = await surface.execute(ctx);
    const afterResult = surface.after ? (await surface.after(ctx)) ?? null : null;

    if (Array.isArray(result?.errors)) {
      errors.push(...result.errors);
    }

    if (surface.summarize) {
      Object.assign(summaries, surface.summarize(result, beforeResult, afterResult));
    }

    if (logger?.log) {
      logger.log('info', `[seed] ${surface.label} complete`);
    }
  }

  return {
    category,
    counts: db.counts(),
    duration_ms: Date.now() - start,
    errors,
    ...summaries,
  };
}
