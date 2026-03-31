# app-sqlite-migration-plan Audit

Date: 2026-03-30

## Scope

- Audited the tracked repo surface with `git ls-files`: 2861 files.
- Indexed the broader working tree for context: 57701 files, but dependency/build artifacts were not treated as source-of-truth.
- Ran repo-wide searches for every major claim in `app-sqlite-migration-plan.html`.
- Checked the live workspace databases:
  - `.workspace/db/app.sqlite`
  - `.workspace/db/mouse/spec.sqlite`
  - `.workspace/db/keyboard/spec.sqlite`
  - `.workspace/db/monitor/spec.sqlite`
  - `.workspace/db/_test_mouse/spec.sqlite`
- Ran targeted contract/characterization tests for AppDb, brand registry, settings persistence, and studio field-studio-map behavior.

## Verdict

`app-sqlite-migration-plan.html` is partially accurate but materially stale. It mixes:

- completed work that is already in the repo,
- outdated pre-migration paths and counts,
- future-phase planning,
- one opening "current state" section that is now historical,
- and an internal contradiction around Phase F / `brand_identifier`,
- and a few broken file/audit references.

As written, it should not be treated as a current implementation source of truth.

## Confirmed Accurate

- AppDb exists and is live: `src/db/appDb.js`, `src/db/appDbSchema.js`, and `src/db/appDbSeed.js` are present and tested.
- AppDb is opened at bootstrap and seeded from JSON if empty: `src/api/bootstrap/createBootstrapSessionLayer.js:47-53`.
- Brand registry runtime state is SQL-backed and JSON is seed-only: `src/features/catalog/README.md:19`, `src/features/catalog/identity/brandRegistry.js:4-10`.
- Settings persistence is SQL-primary when `appDb` is available, with JSON fallback for early boot/tests: `src/features/settings-authority/userSettingsService.js:350-359`, `src/features/settings-authority/userSettingsService.js:470-509`.
- The live workspace does contain `.workspace/db/app.sqlite`, and it has the expected 5 AppDb tables.
- The product ID format claim is partly verified: mouse has 343 products and all current `mouse` product keys match `mouse-{8hex}`.

## Errors And Material Drift

### 1. Wrong database location throughout the report

The report repeatedly describes AppDb as `.specfactory_tmp/app.sqlite` and per-category SpecDb as `.specfactory_tmp/<category>/spec.sqlite`.

That is no longer the live path.

- Report lines: `94`, `137`, `350`, `799`, `916`, `1245`
- Actual code: `src/api/bootstrap/createBootstrapSessionLayer.js:47-49`
- Actual runtime docs: `docs/README.md:7`
- Live workspace: `.workspace/db/app.sqlite` exists; `.specfactory_tmp/app.sqlite` does not.

Impact: the architecture diagrams, bootstrap sequence, and migration steps all point readers to the wrong runtime root.

### 2. The document still frames already-landed work as future/new work

The plan lists core files as "new" even though they already exist and are wired into runtime:

- `src/db/appDb.js`
- `src/db/appDbSchema.js`
- `src/db/appDbSeed.js`

The document is effectively half historical log and half future plan.

Impact: the blast radius and remaining-work narrative are misleading.

### 3. The opening "current state" architecture is no longer current

Section 1 still presents the repo as if three mutable JSON files are the active databases:

- `brand_registry.json`
- `user-settings.json`
- `brand_rename_log.json`

That is not the live state anymore.

- Report lines: `100`, `104`, `113`, `122`
- Current brand registry contract: `src/features/catalog/README.md:19`
- Current settings contract: `src/features/settings-authority/README.md:16`
- Current `_global` contents: `category_authority/_global/` contains `_shared/` and `brand_registry.json`; `brand_rename_log.json` is not present

Impact: the first diagram reads like live architecture, but it is really a pre-migration snapshot.

### 4. Brand counts are wrong

The report says "34 brands" and "every brand is currently assigned only mouse".

Current repo data says otherwise:

- `category_authority/_global/brand_registry.json` contains 27 brands total.
- 25 brands have `["mouse"]`.
- 2 brands have `["_test_mouse"]`.
- Live `.workspace/db/app.sqlite` also contains 27 `brands` rows and 27 `brand_categories` rows.

Impact: the plan overstates current brand inventory and slightly misstates current category distribution.

### 5. Settings counts and registry size are wrong

The report says:

- `src/shared/settingsRegistry.js` is 238 lines.
- `user-settings.json` has about 170 keys.
- runtime has 142 keys.
- ui has 5 keys.

Current repo state:

- `src/shared/settingsRegistry.js` is 220 lines.
- `RUNTIME_SETTINGS_REGISTRY.length === 136`
- `UI_SETTINGS_REGISTRY.length === 4`
- `category_authority/_runtime/user-settings.json` currently has:
  - runtime: 138 keys
  - convergence: 0
  - storage: 0
  - studio: 1 category entry
  - ui: 4 keys
- Live AppDb currently has:
  - settings: 140 rows
  - studio_maps: 1 row

Impact: the report overstates current settings surface and uses stale line/key counts.

### 6. Studio map storage/wiring is described incorrectly

The report treats `studio_maps` in AppDb as the persistence surface used by studio routes.

That is not how the live studio API behaves.

- Report lines: `393`, `408`, `511`, `648`, `1020`
- Actual studio route reads: `src/features/studio/api/studioRoutes.js:322`
- Actual studio route writes: `src/features/studio/api/studioRoutes.js:390`
- Actual studio SQL comment: `src/features/studio/api/studioRoutes.js:437`
- Actual per-category table: `src/db/specDbSchema.js:977`

Current behavior:

- Studio field-studio-map persistence is in per-category `SpecDb.field_studio_map`.
- AppDb `studio_maps` is only exercised by settings-authority snapshot persistence.

Impact: the doc points readers to the wrong database boundary for studio route work.

### 7. Bootstrap/config narrative overstates SQL-first behavior

The report says AppDb should open in `createBootstrapEnvironment.js` and that `src/config.js` loads settings from SQL at init time.

Current behavior is more nuanced:

- AppDb opens in `src/api/bootstrap/createBootstrapSessionLayer.js:47-49`
- `src/config.js:62` calls `loadUserSettingsSync({ categoryAuthorityRoot: helperRoot })` without `appDb`
- `src/api/bootstrap/createBootstrapEnvironment.js:74` also calls `loadUserSettingsSync({ categoryAuthorityRoot: HELPER_ROOT })` without `appDb`
- `src/features/settings-authority/userSettingsService.js:358` explicitly documents this as a JSON fallback boot path

Impact: the report overstates how early SQL is in the boot chain. Runtime route persistence is SQL-primary, but early config boot still has a JSON fallback path.

### 8. Broken or missing references inside the report

A path audit over explicit repo/file references in the HTML found 83 unique references and 11 missing ones.

Missing references:

- `.specfactory_tmp/app.sqlite`
- `.specfactory_tmp/mouse/spec.sqlite`
- `category_authority/_global/spec_seeds.json`
- `src/db/tests/appDb.contract.test.js`
- `src/db/tests/appDbBootstrap.test.js`
- `src/features/catalog/identity/tests/brandRegistry.test.js`
- `src/features/catalog/migrations/brandIdentifierBackfill.js`
- `src/features/settings-authority/tests/userSettingsService.characterization.test.js`
- `src/features/settings/api/configStorageSettingsHandler.js`
- `src/features/settings/api/tests/storageSettingsRoutes.test.js`
- `tools/gui-react/.../BrandManager.tsx`

Some are harmless placeholders, but several are presented as real blast-radius or test artifacts.

### 9. The linked product-ID audit file is missing

The HTML links to `PRODUCT-ID-DECOUPLING-AUDIT.md` at line `88`.

That file does not exist in:

- `docs/implementation/sql-full-migration/`
- repo root

Impact: one of the report's main supporting references is broken.

### 10. Product-ID migration numbers are only partly substantiated

Verified:

- Mouse live SpecDb has 343 products.
- Keyboard and monitor live SpecDbs currently have 0 products.
- `category_authority/mouse/_control_plane/product_catalog.json` has 343 keys and all match `mouse-{8hex}`.

Not fully supported by current repo evidence:

- The report says 26 SQL tables were migrated.
- Current `src/features/catalog/migrations/idFormatMigration.js` contains 25 `product_id` tables in `TABLES_WITH_PRODUCT_ID`.
- The report says 9 generation sites were updated, but the cited audit file is missing, so that count is not currently auditable from the report itself.

Impact: the product-ID summary banner should be treated as partially verified, not fully proven.

### 11. Test inventory and filenames are stale

The report names test files that do not exist.

Current test files:

- `src/db/tests/appDb.test.js`
- `src/db/tests/appDbSchema.test.js`
- `src/db/tests/appDbSeed.test.js`
- `src/features/catalog/identity/tests/brandRegistry.characterization.test.js`
- `src/features/settings-authority/tests/settingsService.characterization.test.js`

Current counts from those live files:

- AppDb tests: 65 passing tests across the three current AppDb test files
- Brand registry characterization tests: 18
- Settings characterization tests: 7

Additional phase-metric drift:

- The report says `brandRegistry.js` was rewritten to `467 LOC` with `13 functions`.
- The current live file is `544` lines and exports `11` functions.

Impact: the report should reference the current test inventory, not the superseded filenames.

### 12. Phase F summary/status is internally contradictory and not implemented yet

The report contradicts itself around `brand_identifier`.

It correctly says Phase F is planned / next:

- `1122-1181` define Phase F work
- `1483` says "Next: Phase F adds brand_identifier to products"

But the summary also claims the result already exists:

- `1451`: "DONE Phase F will add brand_identifier to products"
- `1476`: "Products reference brands by stable 8-hex identifier, not display name"
- `1477`: "Rename becomes O(1): update brands table only, no product cascade"

Those summary claims are false in the current repo:

- Live `products` tables in `mouse`, `keyboard`, and `monitor` do not have a `brand_identifier` column
- `category_authority/mouse/_control_plane/product_catalog.json` has `0/343` entries with `brand_identifier`
- `src/features/catalog/products/productCatalog.js` has no `brand_identifier` handling
- `src/features/catalog/identity/brandRegistry.js:477-505` still cascades product brand display-name updates through `catalogUpdateProduct`

Impact: the summary overstates current implementation and can mislead anyone relying on the bottom-line scorecard instead of the phase details.

## Live Data Snapshot

Live `.workspace/db/app.sqlite` counts at audit time:

- brands: 27
- brand_categories: 27
- brand_renames: 0
- settings: 140
- studio_maps: 1

Live per-category product counts:

- mouse: 343
- keyboard: 0
- monitor: 0
- _test_mouse: 21

## Targeted Proof Run

Commands run:

```powershell
node --test src/db/tests/appDb.test.js src/db/tests/appDbSchema.test.js src/db/tests/appDbSeed.test.js
node --test src/features/catalog/identity/tests/brandRegistry.characterization.test.js
node --test src/features/settings-authority/tests/settingsService.characterization.test.js src/features/settings/api/tests/configPersistenceContext.test.js src/features/settings/api/tests/uiSettingsRoutes.test.js
node --test src/features/studio/api/tests/studioFieldStudioMapContracts.test.js
```

Result:

- 65 AppDb tests passed
- 18 brand registry tests passed
- 17 settings/config route tests passed
- 5 studio field-studio-map tests passed

Total targeted tests passed: 105

## Recommended Corrections To The HTML Report

- Replace all `.specfactory_tmp/...` AppDb/SpecDb path references with the current `.workspace/db/...` reality, or explicitly mark old paths as historical.
- Update the report from "migration plan" to either:
  - a historical implementation log, or
  - a current-state architecture/status document.
- Correct the brand count from 34 to 27 unless the document is intentionally describing an older snapshot.
- Correct the settings counts and registry line count.
- Clarify that studio field-studio-map persistence lives in per-category SpecDb, not AppDb `studio_maps`.
- Fix the broken `PRODUCT-ID-DECOUPLING-AUDIT.md` link or add the missing file.
- Replace stale/missing test and implementation file references with the current filenames.
- Re-check the "26 SQL tables" and "9 generation sites" claims before keeping them in the banner.

## Bottom Line

The underlying migration work is mostly real and largely landed. The problem is the report: it has drifted enough that it now mixes correct current-state facts with outdated path assumptions, stale counts, broken references, and one important storage-boundary mistake around studio maps.
