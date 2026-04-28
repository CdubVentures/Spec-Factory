# Run Artifact Read-Paths Audit

Date: 2026-04-27
Worst severity: **HIGH** — `GET /storage/runs/:runId` still falls back to a full `run.json` parse + per-source `fs.stat()` loop on every request. Two artifact types (HTML + crawl4ai extractions) are persisted but unreachable through the HTTP API.

## Artifact matrix

| Artifact | Disk location | Writer | SQL projection | Reader | Request-time cost |
|---|---|---|---|---|---|
| `run.json` (run meta) | `{runDir}/run.json` | `runtimeBridge.js` (legacy waves) | ✓ `runs` table | `storageManagerRoutes.js:116` falls back to `fs.readFile` | **HIGH** |
| `sources[]` array | inside `run.json` | bridge during fetch | ✓ `crawl_sources` | same fallback | **HIGH** (no pagination) |
| `bridge_events` | SQL only | runtime emit | ✓ native | `getBridgeEventsByRunId(2000)` | LOW |
| `run_summary` artifact | SQL `run_artifacts` | `writeRunSummaryArtifact` | ✓ Tier 1 | `getRunArtifact('run_summary')` | LOW |
| `needset` / `search_profile` / `brand_resolution` | SQL `run_artifacts` | `runtimeBridgeArtifacts.js:72` | ✓ | `getRunArtifact(type)` | LOW |
| Screenshots `*.jpg` | `{runDir}/screenshots/` | `screenshotArtifactPersister.js` | ✓ `source_screenshots` | streamed via `runtimeOpsRoutes.js:253–268` (fast-path) | LOW |
| Videos `*.webm` | `{runDir}/video/` (or OS tmpdir) | `videoArtifactPersister.js` | ✓ `source_videos` | range-request stream (`runtimeOpsRoutes.js:410–441`) | LOW |
| HTML `*.html.gz` | `{runDir}/html/` | `htmlArtifactPersister.js` | ✓ `crawl_sources.file_path` | **no HTTP route** | n/a |
| crawl4ai extractions | `{runDir}/extractions/crawl4ai/*.json` | `crawl4aiPlugin.js` | ✗ | test-only file reads | n/a |

## Identified gaps

### G1. `GET /storage/runs/:runId` still does a JSON-fallback parse — **HIGH**
**File:** `src/features/indexing/api/storageManagerRoutes.js:88, 116–143`
SQL path (`readStorageRunDetailState`) exists but the handler keeps a fallback that reads `run.json` (~46 K-line files observed) and then calls `fs.stat()` for each source's HTML/screenshot/video size — up to ~2 K syscalls per request.

**Fix shape:** delete the JSON fallback. If SQL projection is missing, return 503 with a clear "rebuild required" error rather than degrading to JSON parse.

### G2. `crawl_sources.sources[]` has no pagination — HIGH
**File:** same handler as G1
A run with 1 K+ URLs returns the full array in one response. UI has no `?limit=&offset=` support.

**Fix shape:** add cursor-based pagination on the SQL query and the API contract; UI loads page-by-page.

### G3. HTML artifacts have no HTTP serve route — MEDIUM
**File:** `src/features/indexing/api/runtimeOpsRoutes.js`
Screenshot and video routes exist, but HTML files are indexed in `crawl_sources.file_path` with no corresponding endpoint. If anyone wanted to display crawled HTML they'd have to read disk outside the API.

**Fix shape:** decide intent.
- If HTML should be viewable: add `GET /api/v1/indexlab/run/:runId/runtime/assets/html/:contentHash` with on-the-fly gunzip.
- If HTML is internal-only: delete the disk write or document it (rebuild source for crawl_sources).

### G4. crawl4ai extractions are write-only — MEDIUM
**File:** `src/features/extraction/plugins/crawl4ai/crawl4aiPlugin.js`
JSON files written to `extractions/crawl4ai/`; no SQL projection, no API, no consumer outside tests. If the plugin is meant to feed downstream stages, it's silent dead data.

**Fix shape:** either add `extraction_outputs` SQL projection (with rebuild contract) or add a clear "debug-only" comment + cleanup policy.

### G5. Storage detail page refresh cadence unverified — MEDIUM
**File:** `tools/gui-react/src/features/storage-manager/state/useRunDetail.ts`
Detail page shows artifact sizes that grow during an active run. No subscription to `indexlab-event` for the active run-id; likely poll-only. Pairs with the sync audit's similar finding.

**Fix shape:** subscribe `useRunDetail` to `indexlab-event` filtered by the visible runId; invalidate on each pulse.

### G6. Run finalization emits no `data-change` for catalog — HIGH (cross-references `indexlab-storage-runtime-ops-sync.md` G1)
**File:** `src/indexlab/runtimeBridgeArtifacts.js` finalize hook
At finalize, `runs` and `run_artifacts.run_summary` are updated but no `data-change` event with `domains: ['catalog']` and `entities.productIds: [...]` is emitted. Overview last-run cells lag by `staleTime`.

**Fix shape:** emit at finalize:
```
emitDataChange({
  event: 'run-completed',
  domains: ['catalog'],
  entities: { productIds: [productId] }
});
```

### G7. Screenshot directory candidate resolution duplicated — LOW
**File:** `runtimeOpsRoutes.js` lines 93–116, 204–219, 521–535
Three places compute candidate paths for the screenshot dir. If `indexlab root` shifts mid-session, fallbacks may diverge.

**Fix shape:** extract `resolveScreenshotCandidates()` helper used by all three.

## Encoding / streaming summary

| Artifact | Format | Compression | Range-request? |
|---|---|---|---|
| run.json | JSON | none | n/a |
| Screenshot | JPG | none | no (small files) |
| Video | WebM | container-internal | ✓ RFC 7233 |
| HTML source | gzip on disk | gzip | n/a (no route) |

## Compliance scorecard

| Domain | SQL? | UI source | Status |
|---|---|---|---|
| Run metadata | ✓ | SQL | ✓ |
| Run events / telemetry | ✓ Tier 1 + bridge fallback | SQL | ✓ |
| Artifact metadata (needset, search_profile, brand_resolution) | ✓ | SQL | ✓ |
| Crawl sources | ✓ | falls back to JSON in detail route | **G1** |
| Screenshots | ✓ + disk binary | streamed | ✓ |
| Videos | ✓ + disk binary | streamed (range) | ✓ |
| HTML | ✓ index, no serve route | – | **G3** |
| Extractions (crawl4ai) | ✗ | – | **G4** |

## Recommended fix order

1. **G1** — drop the run.json JSON fallback in storage detail route. Single highest impact.
2. **G6** — emit `data-change` at run finalize. Pairs with most other audits.
3. **G2** — paginate sources in the API + UI.
4. **G3** — decide HTML serve route or document internal-only.
5. **G4** — index or document crawl4ai extractions.
6. **G5** — subscribe Storage detail to indexlab-event.
7. **G7** — extract screenshot path resolution helper.
