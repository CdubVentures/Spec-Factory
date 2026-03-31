# Audit: storage-reference.html

Date: 2026-03-30 (full re-audit)

Scope: validated against the current repo inventory (`2394` paths from `rg --files`), live workspace storage samples, live DB files, and current storage/catalog/settings source files. HTML was not modified.

## Verdict

Partially current for broad file families, but materially stale on concrete paths and mutability rules, and it does not capture the current frontier/crawl-ledger mixed state.

## Changes since previous audit

- This re-audit supersedes the interim audit note that claimed `frontier.db` was gone. The live file still exists at `.workspace/db/frontier.db`.
- The old `src/research/frontierDb.js` helper is gone from source, while newer source code also defines a crawl-ledger migration in SpecDb. The live storage layer is therefore in a mixed state, not a clean cutover.
- Current publishing code is still explicitly dual-write: modern `output/<category>/published/...` plus the legacy `resolveOutputKey(...)` form. The live local workspace still only shows the legacy-style `.workspace/output/specs/outputs/...` tree.

## Confirmed true

- The live workspace still uses `.workspace/runs/<runId>/...` for run artifacts such as `run.json`, gzipped HTML, screenshots, videos, and traces.
- `.workspace/products/<productId>/product.json` still exists as a live file family.
- `category_authority/_runtime/user-settings.json` and `category_authority/_runtime/snapshots/` both exist.
- Per-category SpecDb files still exist under `.workspace/db/<category>/spec.sqlite`.
- The live workspace still contains `.workspace/db/frontier.db`.

## Wrong or stale

- The FrontierDb path is wrong. The HTML points at `.workspace/runs/{category}/_intel/frontier/frontier.db`; the live workspace path is `.workspace/db/frontier.db`.
- The `_learning/` subtree shown in the category-authority structure is not present in the current `mouse`, `keyboard`, `monitor`, or `_test_mouse` category folders.
- `product_catalog.json` is described as a mutable product inventory file. Current source treats it as a read-only boot seed under `category_authority/{category}/_control_plane/product_catalog.json`.
- `product_catalog.json` is not present in every current category helper tree. It exists in `mouse` and `_test_mouse`, but not in the live `keyboard` or `monitor` `_control_plane` folders.
- `user-settings.json` is described as dual-write with `app.sqlite`. Current behavior is SQL-primary when `appDb` is present, with JSON fallback only when `appDb` is absent.
- The published output path model is stale. Current publishing code dual-writes modern keys under `output/<category>/published/<productId>/...` and legacy keys through `storage.resolveOutputKey('output', ...)`, while the live local workspace currently only shows output rooted under `.workspace/output/specs/outputs/...`.
- The `rename_log.json` explanation is too broad. Current source appends this log from catalog migration/rename flows, not as a general always-on catalog-authoring history stream.

## Missing from the document

- The current mixed storage state:
  - live workspace still has `frontier.db`
  - current source also defines `url_crawl_ledger` / `query_cooldowns` tables and a `crawlLedgerAdapter`
  - inspected live SpecDb files do not yet contain those replacement tables
- The fact that some category folders now include `_source` while the live `mouse` folder does not.
- The current `_control_plane` reality for category-owned files such as `field_studio_map.json` and `product_catalog.json`.

## Evidence

- `src/features/catalog/products/productCatalog.js`
- `src/features/settings-authority/userSettingsService.js`
- `src/publish/publishStorageAdapter.js`
- `src/features/catalog/migrations/artifactMigration.js`
- `src/features/indexing/orchestration/shared/crawlLedgerAdapter.js`
- `src/db/specDbSchema.js`
- `category_authority/_runtime/user-settings.json`
- `category_authority/mouse/_control_plane/product_catalog.json`
- `category_authority/mouse/_control_plane/rename_log.json`
- `.workspace/db/frontier.db`
- `.workspace/db/mouse/spec.sqlite`
- `.workspace/runs/20260330082515-8a3d3e/run.json`
- `.workspace/output/specs/outputs/mouse/mouse-6655dc93/runs/20260331010913-cc4f28/analysis/search_profile.json`
- `.workspace/output/specs/outputs/_test_mouse/_test_mouse-testco-scenario-01/latest/summary.json`
