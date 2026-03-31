# Audit: schema-reference.html

Date: 2026-03-30 (full re-audit)

Scope: validated against the current repo inventory (`2394` paths from `rg --files`), live SQLite inspection of all available `.workspace/db/*/spec.sqlite` category DBs plus `.workspace/db/app.sqlite` and `.workspace/db/frontier.db`, and current schema source files. HTML was not modified.

## Verdict

Useful, but incomplete and partially stale. The current live union is larger than the HTML, and the document does not capture the current frontier/crawl-ledger mixed state.

## Changes since previous audit

- This re-audit supersedes the interim audit note that claimed FrontierDb tables were gone. The live `queries`, `urls`, and `yields` tables still exist in `.workspace/db/frontier.db`.
- The fuller cross-category pass raises the live union to `68` logical tables across the inspected DB surfaces.
- Current source also defines `url_crawl_ledger` and `query_cooldowns`, but those tables are not present in the inspected live SpecDb files.

## Confirmed true

- The AppDb table set matches the live workspace by name: `brands`, `brand_categories`, `brand_renames`, `settings`, `studio_maps`.
- The live FrontierDb table names still match the HTML by name: `queries`, `urls`, `yields`.
- Every documented table name still exists somewhere in the inspected live union.

## Wrong or stale

- The FrontierDb path text is stale. The HTML says `.workspace/runs/{category}/_intel/frontier/frontier.db`; the live DB is `.workspace/db/frontier.db`.
- The document currently contains `61` table entries, while the inspected live union across current DB surfaces is `68`.
- The document does not account for current category variance. Live SpecDb counts currently range from `53` to `58`.
- At least these documented summary column counts do not match the current `mouse` slice:
  - `products`: doc `5`, live `11`
  - `product_queue`: doc `11`, live `22`
  - `product_runs`: doc `11`, live `16`
  - `curation_suggestions`: doc `10`, live `19`
  - `component_review_queue`: doc `11`, live `24`
  - `audit_log`: doc `7`, live `17`
  - `queries`: doc `9`, live `13`
  - `evidence_chunks_fts`: doc `54`, live `3` visible columns from `PRAGMA table_info(...)`

## Missing from the document

- These live tables are missing from the inspected current DB union:
  - `component_lexicon`
  - `crawl_media`
  - `domain_classifications`
  - `domain_field_yield`
  - `field_anchors`
  - `metrics`
  - `url_memory`
- These source-defined transition tables are also not documented:
  - `url_crawl_ledger`
  - `query_cooldowns`
  Note: they are present in current schema source, but not in the inspected live SpecDb files yet.

## Evidence

- `.workspace/db/app.sqlite`
- `.workspace/db/frontier.db`
- `.workspace/db/mouse/spec.sqlite`
- `.workspace/db/keyboard/spec.sqlite`
- `.workspace/db/monitor/spec.sqlite`
- `.workspace/db/_test_mouse/spec.sqlite`
- `src/db/specDbSchema.js`
- `src/db/specDbStatements.js`
- `src/db/stores/crawlLedgerStore.js`
