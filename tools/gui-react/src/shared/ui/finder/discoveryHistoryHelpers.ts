// WHY: Shared grouping logic used by both DiscoveryHistoryDrawer (for
// rendering) and DiscoveryHistoryButton (for count badges). Keeps the two
// in lock-step so the button's (XXqu)(XXurl) counts always match what the
// drawer actually shows.

export type ScopeLevel = 'product' | 'variant' | 'variant+mode' | 'field_key' | '';

export interface FinderRunResponse {
  variant_id?: string | null;
  variant_key?: string;
  mode?: string;
  // PIF — fine-grained pool key (priority-view / view:<focus> / loop-view /
  // loop-hero / hero). When present, takes precedence over `mode` for the
  // 'variant+mode' bucket axis so the drawer mirrors the same pool isolation
  // the orchestrator uses to filter previous-discovery URLs/queries.
  run_scope_key?: string;
  // keyFinder — the key this run was dispatched for. Also appears as a top-
  // level group key when scopeLevel='field_key'.
  primary_field_key?: string;
  discovery_log?: { urls_checked?: string[]; queries_run?: string[] };
  // CEF two-gate shape
  discovery?: { discovery_log?: { urls_checked?: string[]; queries_run?: string[] } };
}

export interface FinderRun {
  ran_at?: string;
  response?: FinderRunResponse;
}

export interface GroupedHistory {
  totalUrls: number;
  totalQueries: number;
  productUrls: string[];
  productQueries: string[];
  byVariant: Map<string, { urls: Set<string>; queries: Set<string> }>;
  byVariantMode: Map<string, Map<string, { urls: Set<string>; queries: Set<string> }>>;
  byFieldKey: Map<string, { urls: Set<string>; queries: Set<string> }>;
}

export function getLogFromRun(run: FinderRun) {
  return run.response?.discovery_log || run.response?.discovery?.discovery_log || null;
}

export function groupHistory(
  runs: readonly FinderRun[],
  scopeLevel: ScopeLevel,
): GroupedHistory {
  const productUrls = new Set<string>();
  const productQueries = new Set<string>();
  const byVariant = new Map<string, { urls: Set<string>; queries: Set<string> }>();
  const byVariantMode = new Map<string, Map<string, { urls: Set<string>; queries: Set<string> }>>();
  const byFieldKey = new Map<string, { urls: Set<string>; queries: Set<string> }>();

  for (const run of runs) {
    const log = getLogFromRun(run);
    if (!log) continue;
    const urls = Array.isArray(log.urls_checked) ? log.urls_checked : [];
    const queries = Array.isArray(log.queries_run) ? log.queries_run : [];

    if (scopeLevel === 'product') {
      for (const u of urls) productUrls.add(u);
      for (const q of queries) productQueries.add(q);
    } else if (scopeLevel === 'variant') {
      const vid = run.response?.variant_id || run.response?.variant_key || '';
      if (!vid) continue;
      let bucket = byVariant.get(vid);
      if (!bucket) { bucket = { urls: new Set(), queries: new Set() }; byVariant.set(vid, bucket); }
      for (const u of urls) bucket.urls.add(u);
      for (const q of queries) bucket.queries.add(q);
    } else if (scopeLevel === 'variant+mode') {
      const vid = run.response?.variant_id || run.response?.variant_key || '';
      // WHY: PIF reinterprets this axis as the pool key (run_scope_key) for
      // new runs, falling back to mode for legacy runs without run_scope_key.
      // Other finders don't reach this branch (only PIF uses 'variant+mode').
      const mode = run.response?.run_scope_key || run.response?.mode || '';
      if (!vid || !mode) continue;
      let modes = byVariantMode.get(vid);
      if (!modes) { modes = new Map(); byVariantMode.set(vid, modes); }
      let bucket = modes.get(mode);
      if (!bucket) { bucket = { urls: new Set(), queries: new Set() }; modes.set(mode, bucket); }
      for (const u of urls) bucket.urls.add(u);
      for (const q of queries) bucket.queries.add(q);
    } else if (scopeLevel === 'field_key') {
      const fk = run.response?.primary_field_key || '';
      if (!fk) continue;
      let bucket = byFieldKey.get(fk);
      if (!bucket) { bucket = { urls: new Set(), queries: new Set() }; byFieldKey.set(fk, bucket); }
      for (const u of urls) bucket.urls.add(u);
      for (const q of queries) bucket.queries.add(q);
    }
  }

  const totalUrls = productUrls.size
    + [...byVariant.values()].reduce((sum, b) => sum + b.urls.size, 0)
    + [...byVariantMode.values()].reduce(
        (s1, modes) => s1 + [...modes.values()].reduce((s2, b) => s2 + b.urls.size, 0),
        0,
      )
    + [...byFieldKey.values()].reduce((sum, b) => sum + b.urls.size, 0);
  const totalQueries = productQueries.size
    + [...byVariant.values()].reduce((sum, b) => sum + b.queries.size, 0)
    + [...byVariantMode.values()].reduce(
        (s1, modes) => s1 + [...modes.values()].reduce((s2, b) => s2 + b.queries.size, 0),
        0,
      )
    + [...byFieldKey.values()].reduce((sum, b) => sum + b.queries.size, 0);

  return {
    totalUrls,
    totalQueries,
    productUrls: [...productUrls],
    productQueries: [...productQueries],
    byVariant,
    byVariantMode,
    byFieldKey,
  };
}
