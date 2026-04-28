# Run Artifact Read-Paths Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

The storage detail route no longer parses `run.json` as a request-time fallback. Remaining issues are durable SQL projection/finalizer coverage, payload sizing, artifact exposure decisions, and active-run freshness.

## Active Findings

### G1. Storage Run Detail B2 durable projection/finalizer coverage is not confirmed - HIGH
**Files:** storage schema/finalization path for run sources

Removing the route fallback is not the full durable fix. The long-term contract still needs a `run_sources` SQL projection, finalization write, and rebuild path so detail reads never depend on runtime artifact JSON.

**Fix shape:** Confirm schema, finalizer write, and deleted-DB rebuild coverage before marking Storage Run Detail B2 done.

### G2. IndexLab URL history B3 table/finalization/rebuild path needs confirmation - MEDIUM
**Files:** IndexLab URL history reader/finalization/rebuild path

The URL history reader is SQL-first, but the full table, finalization write, and rebuild path still need confirmation.

**Fix shape:** Verify table schema, finalizer population, and rebuild from durable product/run artifacts.

### G3. `crawl_sources.sources[]` has no pagination - MEDIUM
**File:** `src/features/indexing/api/storageManagerRoutes.js`

Large runs can return the full source array in one response. This is acceptable for small runs but can become slow or memory-heavy for 1K+ URLs.

**Fix shape:** Add cursor or limit/offset pagination on the SQL query and UI.

### G4. HTML artifacts have no HTTP serve route - MEDIUM
**Files:** `src/features/extraction/plugins/html/htmlArtifactPersister.js`, `src/features/indexing/api/runtimeOpsRoutes.js`

HTML files are persisted and indexed, but no user-facing HTTP route serves them.

**Fix shape:** Decide intent. If user-facing, add an API route with safe decompression/streaming. If internal-only, document the rebuild/debug purpose.

### G5. crawl4ai extractions are write-only - MEDIUM
**File:** `src/features/extraction/plugins/crawl4ai/crawl4aiPlugin.js`

crawl4ai JSON extraction files are written, but no SQL projection, API, or non-test consumer was found.

**Fix shape:** Either project them into SQL/API as extraction outputs or document them as debug-only with cleanup policy.

### G6. Storage detail page freshness is stale-window based - MEDIUM
**File:** `tools/gui-react/src/features/storage-manager/state/useRunDetail.ts`

Artifact sizes can grow while the user is looking at a run detail page, but the page does not subscribe to active run events.

**Fix shape:** Subscribe to active run pulses and invalidate/refetch the visible run detail.

### G7. Screenshot directory candidate resolution is duplicated - LOW
**File:** `src/features/indexing/api/runtimeOpsRoutes.js`

Several routes compute screenshot path candidates separately, which can diverge if the IndexLab root changes.

**Fix shape:** Extract a shared candidate-resolution helper.

## Recommended Fix Order

1. **G1** - Confirm/implement durable `run_sources` projection, finalizer, and rebuild path.
2. **G2** - Confirm URL history table/finalization/rebuild coverage.
3. **G3** - Add pagination if large runs are common.
4. **G6** - Subscribe Storage detail to active-run events.
5. **G4/G5** - Decide artifact product direction.
6. **G7** - Extract screenshot path helper.
