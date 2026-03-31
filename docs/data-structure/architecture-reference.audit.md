# Audit: architecture-reference.html

Date: 2026-03-30 (full re-audit)

Scope: validated against the current repo inventory (`2394` paths from `rg --files`), all `src/...` references embedded in the HTML, live workspace DB/storage samples, and current source modules. HTML was not modified.

## Verdict

Partially current. The route/module map still lands, but the storage and database model is stale and the document does not reflect the current mixed state between the live workspace and the in-progress crawl-ledger migration in source.

## Changes since previous audit

- This re-audit supersedes the interim audit note that claimed FrontierDb was fully eliminated. That is not true in the current live workspace.
- The live workspace still has `.workspace/db/frontier.db` with `queries`, `urls`, and `yields`.
- Current source has moved away from the old `src/research/frontierDb.js` helper and now also contains a newer `crawlLedgerAdapter` plus `url_crawl_ledger` / `query_cooldowns` SpecDb schema path, but the inspected live SpecDb files do not yet contain those replacement tables.

## Confirmed true

- All `15` `src/...` references embedded in this HTML currently resolve.
- Main route registrars are still wired from `src/api/guiServerRuntime.js`.
- Three database surfaces still exist in the live workspace: per-category `spec.sqlite`, global `app.sqlite`, and global `frontier.db`.
- Runtime file families under `.workspace/runs/<runId>/...` still exist, including `run.json`, `html/*.html.gz`, and `screenshots/*.jpg`.
- `src/shared/settingsRegistry.js` is still the settings SSOT used by current config/route derivation.

## Wrong or stale

- The FrontierDb path is wrong. The HTML says `.workspace/runs/{cat}/_intel/frontier/frontier.db`; the live workspace path is `.workspace/db/frontier.db`.
- The fixed SpecDb table count is too rigid. Inspected category DBs currently range from `53` to `58` logical tables, not one fixed count.
- The settings headline/examples are stale. Current counts are `136` runtime entries, `3` bootstrap env entries, and `4` UI entries. Current `group === "paths"` keys are `categoryAuthorityRoot`, `localInputRoot`, and `specDbDir`.
- `product_catalog.json` is shown with the wrong path and wrong mutability. Current source resolves it under `category_authority/{cat}/_control_plane/product_catalog.json` and treats it as a read-only boot seed.
- `user-settings.json` is described as dual-write. Current behavior is SQL-primary when `appDb` exists, with JSON used only as a fallback for tests and early boot.
- The FrontierDb description is incomplete for current source. The HTML presents only the older frontier surface, while current source also contains a partially landed crawl-ledger migration path in SpecDb.

## Missing from the document

- The current mixed state: live `frontier.db` still exists, while current source also defines `crawlLedgerAdapter`, `url_crawl_ledger`, and `query_cooldowns`.
- Cross-category SpecDb variance. The current workspace does not expose one uniform per-category SpecDb shape.

## Evidence

- `src/api/guiServerRuntime.js`
- `src/shared/settingsRegistry.js`
- `src/features/settings-authority/userSettingsService.js`
- `src/features/catalog/products/productCatalog.js`
- `src/features/indexing/orchestration/shared/crawlLedgerAdapter.js`
- `src/db/specDbSchema.js`
- `.workspace/db/app.sqlite`
- `.workspace/db/frontier.db`
- `.workspace/db/mouse/spec.sqlite`
- `.workspace/db/keyboard/spec.sqlite`
- `.workspace/db/monitor/spec.sqlite`
- `category_authority/_runtime/user-settings.json`
- `category_authority/mouse/_control_plane/product_catalog.json`
