# `data-authority/snapshot` Query Audit

Date: 2026-04-27
Worst severity: **LOW** — broad invalidation looks scary but only one consumer mounts the query, so impact is small. Documentation gap is the real problem.

## Endpoint

`GET /data-authority/{category}/snapshot` — `src/features/category-authority/api/dataAuthorityRoutes.js`

Cheap: O(1) reads from `sessionCache`, `specDb.getSpecDbSyncState`, `getDataPropagationCountersSnapshot`, `getSettingsPersistenceCountersSnapshot`. No DB queries, no filesystem.

Returns:
```
{
  category,
  authority_version,        // composite: map_hash | compiled_hash | sync_version | updated_at
  version: { map_hash, compiled_hash, specdb_sync_version, updated_at },
  changed_domains: string[],
  compile_stale: boolean,
  source_timestamps: { compiled_at, map_saved_at, specdb_sync_at },
  specdb_sync: { status, version, updated_at, meta },
  observability: {
    data_change: { total, last_broadcast_at, category_count, by_event },
    queue_cleanup: { ... },
    settings_persistence: { writes, deletes },
  },
}
```

## Consumer

**Single consumer:** `tools/gui-react/src/features/studio/state/useStudioPageDocsController.ts` via `tools/gui-react/src/hooks/useAuthoritySnapshot.js`.

```
queryKey: ['data-authority', 'snapshot', category],
staleTime: 2_500,
refetchInterval: 10_000,
enabled: category !== 'all',
```

Only the composite `authorityVersionToken` is read. `observability` payload is fetched but unused on the client.

## Invalidation coverage

`withAuthoritySnapshot()` appends the key to 11 domains: studio, mapping, review-layout, labels, catalog, identity, review, component, enum, product, key-finder. ~9–15 distinct events trigger it.

The breadth looks expensive but is benign because **only one consumer mounts the query**. Invalidation = "next refocus / 10 s tick refetches a cheap endpoint once".

## Identified gaps

### G1. No documentation of "why so broad" — LOW
**File:** `src/core/events/eventRegistry.js`
`withAuthoritySnapshot()` is opaque — readers see snapshot in 11 domain templates and assume it's a heavy cross-screen dependency.

**Fix shape:** add a 3-line comment above the helper explaining: "Studio Page is the only consumer; snapshot is appended broadly because the snapshot payload reflects all authority sources; invalidation cost is one cheap endpoint call."

### G2. Unused `observability` payload — LOW-MEDIUM
**File:** `dataAuthorityRoutes.js:174` builds observability counters; client extracts only `authorityVersionToken`. The wire payload is heavier than needed and risks drift if someone reuses it.

**Fix shape:** either (a) ship a separate lightweight `/version-token` endpoint and let Studio use that, OR (b) keep the rich payload and document "reserved for future telemetry dashboards" so future consumers know how to plug in.

### G3. Polling + invalidation redundancy — LOW
2.5 s `staleTime` + 10 s `refetchInterval` + WS-driven invalidation can result in 2–3 fetches when one would do. Cheap endpoint, so not a real problem.

**Fix shape:** consider raising `staleTime` to e.g. 30 s once `data-change` is trusted to invalidate reliably; keep polling as fallback.

### G4. No regression test for cascade — LOW
Tests assert presence of the key in resolved invalidations but not absence elsewhere. If someone added a snapshot append to 50 unrelated domains, current tests wouldn't catch it.

**Fix shape:** add a negative test ("snapshot must only be in these 11 domains") OR document the invariant.

## Confirmed-good patterns

- Lightweight endpoint suitable for high-frequency polling.
- Single `withAuthoritySnapshot` helper concentrates the append logic.
- `resolveAuthoritySnapshotInvalidationQueryKeys` (`tools/gui-react/src/hooks/authoritySnapshotHelpers.js:65–79`) cleanly merges domain templates with the snapshot key per scoped category.

## Recommended fix order

1. **G1** — comment in `eventRegistry.js`. ~3 min.
2. **G2** — pick a path (separate endpoint or document); ~30 min if splitting.
3. **G4** — negative test or invariant doc.
4. **G3** — raise `staleTime` once confidence in invalidation is high.
