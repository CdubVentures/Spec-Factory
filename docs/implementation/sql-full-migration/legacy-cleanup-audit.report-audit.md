# `legacy-cleanup-audit.html` Audit

Date: 2026-03-30

## Scope

- Audited the current tracked repository state (`git ls-files` = 2,861 files).
- Verified the claims in `docs/implementation/sql-full-migration/legacy-cleanup-audit.html` against live source, tests, scripts, and current docs.
- Used repo-wide `rg`/`git grep` searches plus runtime spot checks for the two Tier 1 bugs.
- Second pass revalidated every explicit file/path reference extracted from the HTML, including missing-file and shorthand-path checks.

## Verdict

The report is not safe to use as a current cleanup plan without revision.

- Tier 1 contains two real bugs that still reproduce.
- Several later tiers are materially stale.
- Multiple summary counts no longer match the current repository.
- Some file/doc references in the report now point to files that do not exist.

## Confirmed Findings

### Still true

1. `Bug 1: Double-Nesting Path in LocalStorage` is still real.
   - Reproduced with `createStorage({ outputMode: 'local', localOutputRoot: '.workspace/output' })`.
   - `storage.resolveOutputKey('_billing', 'monthly', '2026-03.txt')` returns `specs/outputs/_billing/monthly/2026-03.txt`.
   - `resolveLocalPath()` then resolves that to `.workspace/output/specs/outputs/_billing/monthly/2026-03.txt`.

2. `Bug 2: Duplicate Billing Writes` is still real.
   - Reproduced via `buildBillingReport(...)`.
   - Current code writes all four keys:
     - `_billing/monthly/2026-03.txt`
     - `_billing/latest.txt`
     - `specs/outputs/_billing/monthly/2026-03.txt`
     - `specs/outputs/_billing/latest.txt`

3. `HELPER_FILES_ROOT` is still read as a legacy alias.
   - Verified in `src/core/config/configBuilder.js`.

4. The report's `0 TODOs / Hacks` summary is currently consistent with a repo-wide `rg "TODO|HACK"` scan across `src`, `tools`, `scripts`, and `docs` when the report file itself is excluded.

## Errors And Drift

### Global / summary-card errors

1. The subtitle is wrong.
   - Report claim: `~1,345 files audited`
   - Current tracked repo: `2,861` files

2. The HTML contains mojibake.
   - Title/comments contain garbled replacement text instead of the intended em-dash and box-drawing characters.

3. The report mixes concrete repo paths with shorthand references that are not valid standalone files.
   - Examples: `runtimeArtifactRoots.js`, `configBuilder.js:203`, `publishAnalytics.js:334`, `frontierDb.js`
   - That makes parts of the report harder to verify or act on mechanically.

### Tier 1 errors

1. Bug 1 is real, but the report's code excerpt is stale.
   - Current `resolveLocalPath()` is simpler than the snippet shown in the report.
   - The report's line references for `src/s3/storage.js` no longer match the current file.

### Tier 2 errors

1. `4 runtime roots defaulting to hidden system dirs` is stale.
   - Current defaults are project-local:
     - `src/core/config/runtimeArtifactRoots.js`
       - `defaultLocalOutputRoot()` -> `.workspace/output`
       - `defaultIndexLabRoot()` -> `.workspace/runs`
       - `defaultProductRoot()` -> `.workspace/products`
     - `src/shared/settingsRegistry.js`
       - `specDbDir` default -> `.workspace/db`
       - `categoryAuthorityRoot` default -> `category_authority`
   - The report's `%LOCALAPPDATA%` default claim no longer matches current source.

2. The `.specfactory_tmp` subsection is internally inconsistent and stale.
   - Report claim: `24 files`
   - The detail tables enumerate only `21` concrete file paths.
   - Of those 21 listed files, only `4` still contain a literal `.specfactory_tmp` match in the current non-generated tree:
     - `src/api/guiServerRuntimeConfig.js`
     - `src/api/tests/guiServerRuntimeConfig.test.js`
     - `src/app/cli/commands/migrateToSqliteCommand.js`
     - `scripts/generateStorageChangeAudit.js`
   - Generated bundle also contains legacy strings:
     - `tools/dist/launcher.cjs`

3. Several specific storage-location findings are outdated.
   - `src/research/frontierDb.js` no longer exists in the current workspace.
   - Current source contains explicit post-elimination notes that `frontier.db` was replaced by spec.sqlite-backed crawl ledger/query cooldown tables.
   - `src/features/crawl/crawlSession.js` now sets `CRAWLEE_STORAGE_DIR` to `.workspace/crawlee`, so the implicit `storage/` root claim is stale.
   - The report points at `tools/crawl-probe-report.mjs:521`, but the current `.workspace/crawl-probe-reports` write path is in `tools/crawl-probe.mjs:521`.
   - `src/publish/publishProductWriter.js` stages under `os.tmpdir()/specfactory-phase9`, not `.specfactory_tmp/phase9`.

4. The report understates the current project-local artifact roots.
   - In addition to `.workspace/output`, `.workspace/runs`, `.workspace/db`, and `category_authority`, current live code also uses `.workspace/products` via `defaultProductRoot()` for product checkpoint / product identity flows.

### Tier 3 errors

1. The report references a missing document.
   - `schema-consolidation-plan.html` is not present anywhere under `docs/`.

2. Some table-presence claims are still supported, but the section overstates certainty.
   - Confirmed active tables in `src/db/specDbSchema.js`:
     - `product_review_state`
     - `bridge_events`
     - `source_screenshots`
     - `source_videos`
     - `source_pdfs`
   - `crawl_media` does not exist in current live source.
   - `learning_sync` does not appear in current live source/schema.

3. The `metrics` row is not supported by current live schema code.
   - I found no live `CREATE TABLE IF NOT EXISTS metrics`, `metricsStore`, or `metricsWriter` in current source.
   - The report says `metrics` is an active telemetry sink, but that claim is not currently proven by live code.

4. The recommended execution order is stale for Tier 3 / Tier 6 follow-ups.
   - It still says to update `schema-consolidation-plan.html`.
   - It still scopes one storage fix to `frontierDb.js`, which is not a current file.

### Tier 4 errors

1. The orphaned-test inventory is stale.
   - Already missing from the current tree:
     - `src/api/services/tests/storageToRuntimePropagation.test.js`
     - `src/shared/tests/storageRegistryDerivations.test.js`
     - `src/shared/tests/storageSettingsDefaultsContract.test.js`
     - `src/features/settings/api/tests/storageSettingsRoutes.test.js`
   - The two GUI test rows are elided with `...` and are not concrete current paths in the report.

2. The `settingsEnvelopeContract.test.js` claim is false.
   - Report claim: dead section at lines `142-168` testing `storage-settings`.
   - Reality:
     - the file currently has only `124` lines
     - it does not contain `storage-settings` route tests

3. The backend/frontend dead-file list is only partially trustworthy.
   - The listed backend/frontend files still exist.
   - A basename-level repo-wide reference scan found no live source references for those 24 non-test file paths.
   - That makes them plausible dead-file candidates, but the report's test subsection is stale enough that the full Tier 4 delete plan should be regenerated before use.

### Tier 5 errors

1. `Dead Settings` is overstated.
   - Confirmed active or still-consumed:
     - `runtimeControlFile`
       - used in `src/features/indexing/orchestration/shared/runtimeHelpers.js`
       - surfaced in tests and GUI payload types
     - `autoScrollPostLoadWaitMs`
       - used in `src/features/crawl/plugins/autoScrollPlugin.js`
     - `domExpansionSettleMs`
       - used in `src/features/crawl/plugins/domExpansionPlugin.js`
   - `retrievalIdentityFilterEnabled` appears to be config-assembly residue, but not a proven live dead key purely from the report's reasoning.

2. The report is self-contradictory on `autoScrollPostLoadWaitMs`.
   - It is listed under `Unused Registry Settings`.
   - The note in the same row says it is "deprecated but still read".

3. `Ghost References in Test Mocks` is incomplete.
   - `runtimeEventsKey` still appears outside those two GUI tests, including `src/testing/testRunner.js`.

### Tier 6 errors

1. Duplicate-function counts drifted.
   - Current exact-name counts found by repo-wide search:
     - `slugify()` -> `5`, not `4`
     - `capitalize()` -> `5`, not `2`
     - `normalizePath()` -> `3` exact matches, which aligns with the report

2. The unused-dependency section is only partially proven.
   - No live imports found for:
     - `@mozilla/readability`
     - `jsdom`
   - `pdf-parse` still appears in `tools/build-exe.mjs` as an explicit external.
   - `@duckduckgo/autoconsent` appears in source comments, while live code imports `playwright-autoconsent`.
   - Conclusion: the "delete these 4 dependencies" recommendation should be confirmed with package/runtime review, not source grep alone.

### Tier 7 errors

1. The stale-doc count is overstated.
   - Many current doc hits mentioning `storage-settings` or `runDataRelocationService` are corrective notes explaining that those surfaces were removed, not stale guidance.
   - Clearly stale docs/READMEs still exist, but the report's `12 files` summary overcounts by treating explanatory references as stale references.

2. Two README files are still stale.
   - `src/features/settings-authority/README.md`
   - `src/features/settings/README.md`
   - Both still mention `src/api/services/runDataRelocationService.js`, which does not exist.

3. `app-sqlite-migration-plan.html` still references `configStorageSettingsHandler.js`.
   - That is a real stale-doc issue not called out cleanly in the report's current count methodology.

4. The report misses a newer stale-doc cluster around eliminated `frontier.db` surfaces.
   - Current docs still describe `.workspace/runs/{category}/_intel/frontier/frontier.db` in:
     - `docs/data-structure/storage-reference.html`
     - `docs/data-structure/schema-reference.html`
     - `docs/data-structure/architecture-reference.html`
   - Those stale references are called out by newer `*.audit.md` files, but not by `legacy-cleanup-audit.html`.

### Tier 8 errors

1. The report says Known Remaining is tracked in `MIGRATION-STATUS.mmd`.
   - In the current workspace, `docs/implementation/sql-full-migration/MIGRATION-STATUS.mmd` is absent.

## Current Safe Takeaway

Use the report only for these two actions without regeneration:

1. Fix `src/s3/storage.js` local-path prefix nesting.
2. Remove the duplicate legacy billing digest writes in `src/billing/costLedger.js`.

Do not use the rest of the report as a current deletion or consolidation checklist without regenerating it from the current tree.

## Minimal Regeneration Targets

If this report is going to stay in the repo, it should be regenerated or rewritten to reflect:

1. `2,861` tracked files audited, not `~1,345`.
2. `.workspace` defaults instead of `%LOCALAPPDATA%`.
3. `4` current non-generated `.specfactory_tmp` literal references, not `24`.
4. Tier 4 test cleanup status after already-deleted files are removed from the report.
5. Tier 5 settings status after active settings are removed from the dead-settings bucket.
6. Tier 3 references updated to existing docs only.
