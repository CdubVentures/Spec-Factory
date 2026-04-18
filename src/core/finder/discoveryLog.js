// WHY: One discovery-log accumulator + prompt fragment used by every finder
// module (CEF, PIF, RDF). Each module opts in via two per-module settings —
// urlHistoryEnabled + queryHistoryEnabled — and supplies its own runMatcher to
// scope which prior runs count as "history" (product, variant, variant+mode).
// No cooldown filtering here — pipeline-level urlCooldownDays lives elsewhere
// and governs a different concern (crawler re-crawl policy, not prompt text).

/**
 * @typedef {{
 *   ran_at?: string,
 *   response?: {
 *     variant_key?: string,
 *     variant_id?: string|null,
 *     mode?: string|null,
 *     discovery_log?: { urls_checked?: unknown, queries_run?: unknown },
 *   },
 * }} FinderRun
 */

/**
 * @param {FinderRun[]} previousRuns
 * @param {{
 *   runMatcher?: (run: FinderRun) => boolean,
 *   includeUrls?: boolean,
 *   includeQueries?: boolean,
 *   suppressions?: { urlsChecked?: Set<string>, queriesRun?: Set<string> },
 * }} [opts]
 * @returns {{ urlsChecked: string[], queriesRun: string[] }}
 */
export function accumulateDiscoveryLog(previousRuns, opts = {}) {
  const {
    runMatcher,
    includeUrls = false,
    includeQueries = false,
    suppressions = {},
  } = opts;
  const urlSuppressions = suppressions.urlsChecked instanceof Set ? suppressions.urlsChecked : new Set();
  const querySuppressions = suppressions.queriesRun instanceof Set ? suppressions.queriesRun : new Set();

  if (!includeUrls && !includeQueries) {
    return { urlsChecked: [], queriesRun: [] };
  }

  const urlSet = new Set();
  const querySet = new Set();

  for (const run of previousRuns || []) {
    if (runMatcher && !runMatcher(run)) continue;
    const log = run?.response?.discovery_log;
    if (!log) continue;
    if (includeUrls && Array.isArray(log.urls_checked)) {
      for (const u of log.urls_checked) urlSet.add(u);
    }
    if (includeQueries && Array.isArray(log.queries_run)) {
      for (const q of log.queries_run) querySet.add(q);
    }
  }

  return {
    urlsChecked: [...urlSet].filter((u) => !urlSuppressions.has(u)),
    queriesRun: [...querySet].filter((q) => !querySuppressions.has(q)),
  };
}

/**
 * @param {{ urlsChecked: string[], queriesRun: string[], scopeLabel: string }} opts
 * @returns {string}
 */
export function buildPreviousDiscoveryBlock({ urlsChecked = [], queriesRun = [], scopeLabel = 'this product' } = {}) {
  if (urlsChecked.length === 0 && queriesRun.length === 0) return '';
  const lines = [`Previous searches for ${scopeLabel} (do not repeat — find NEW sources or confirm these):`];
  if (urlsChecked.length > 0) lines.push(`- URLs already checked: ${JSON.stringify(urlsChecked)}`);
  if (queriesRun.length > 0) lines.push(`- Queries already run: ${JSON.stringify(queriesRun)}`);
  return `${lines.join('\n')}\n`;
}
