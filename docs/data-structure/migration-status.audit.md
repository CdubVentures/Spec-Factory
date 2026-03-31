# Audit: migration-status.html

Date: 2026-03-30 (full re-audit)

Scope: validated against the current repo inventory (`2394` paths from `rg --files`), live SQLite surfaces, live workspace storage samples, and current persistence/migration code. HTML was not modified.

## Verdict

Materially stale and too absolute. The document reads like migration is complete and uniform, but the current repo/workspace shows a mixed state.

## Changes since previous audit

- This re-audit supersedes the interim audit note that claimed FrontierDb was gone. The live workspace still contains `.workspace/db/frontier.db` with `queries`, `urls`, and `yields`.
- Current source also defines a newer crawl-ledger / query-cooldown path in SpecDb, but the inspected live SpecDb files do not yet contain those replacement tables.
- The fuller cross-category pass shows current SpecDb counts vary by category from `53` to `58`. The inspected live union across DB surfaces is `68` logical tables. The `mouse + app + frontier` slice is `66`.

## Confirmed true

- SQLite is still the primary persistence layer.
- The "What Was Killed / Replaced" trace-writer rows are still historically consistent with the current repo state.
- Many store mappings in the document still point at real live SQL tables.

## Wrong or stale

- The opening claim "All 61 tables across 3 database surfaces" is outdated and too rigid. Current live totals are not a single fixed number.
- "Every file-based data store has been replaced with structured SQL persistence" is false as written. File artifacts still exist and are still used for runs, products, screenshots, HTML snapshots, and output artifacts.
- "No dual-write paths remain" is too broad. Settings still have a JSON fallback path, and publishing currently dual-writes modern and legacy output keys.
- "Zero legacy JSONL writers" is false or at least too broad for the current repo. Current source still reads or writes paths such as `_billing/ledger.jsonl`, `.../evidence/sources.jsonl`, and `_runtime/events.jsonl`.
- "Migration Complete" is too strong for the frontier/crawl-ledger area. Current source and current live DBs are not yet in one uniform end state.

## Missing from the document

- The current mixed frontier state:
  - live workspace still has `frontier.db`
  - source now also defines `crawlLedgerAdapter`, `url_crawl_ledger`, and `query_cooldowns`
  - inspected live SpecDb files do not yet contain those replacement tables
- The live FrontierDb path at `.workspace/db/frontier.db`
- The current cross-category SpecDb variance (`53` to `58` logical tables)

## Evidence

- `src/db/specDbSchema.js`
- `src/db/specDbStatements.js`
- `src/features/indexing/orchestration/shared/crawlLedgerAdapter.js`
- `src/features/settings-authority/userSettingsService.js`
- `src/publish/publishStorageAdapter.js`
- `src/publish/publishAnalytics.js`
- `src/features/expansion-hardening/expansionHardening.js`
- `src/features/indexing/api/builders/domainChecklistBuilder.js`
- `src/cli/s3Integration.js`
- `.workspace/db/app.sqlite`
- `.workspace/db/frontier.db`
- `.workspace/db/mouse/spec.sqlite`
- `.workspace/db/keyboard/spec.sqlite`
- `.workspace/db/monitor/spec.sqlite`
- `.workspace/runs/20260330082515-8a3d3e/run.json`
- `.workspace/products/mock-pid/product.json`
- `.workspace/output/specs/outputs/_test_mouse/_test_mouse-testco-scenario-01/latest/summary.json`
