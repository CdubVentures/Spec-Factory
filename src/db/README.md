## Purpose

SQLite-backed persistence layer for review state, component identity, and queue management.

**SpecDb** (`specDb.js`): Per-category facade over domain-specific store modules. One instance per category, located at `.workspace/db/{category}/spec.sqlite`.

**AppDb** (`appDb.js`): Shared cross-category database at `.workspace/db/app.sqlite` for global state: brands (34+), brand categories, brand renames, user settings (~170 keys), studio maps, color registry, unit registry, billing entries, and seed hash tracking. Opened once at bootstrap, shared across all categories.
  - Billing: `insertBillingEntry`, `getBillingRollup(month, category?)`, `getBillingEntriesForMonth`, `getBillingSnapshot`, `getGlobalDaily`, `getGlobalEntries`, `countBillingEntries`
  - Dual-state: billing entries are dual-written to SQL + `.workspace/global/billing/ledger/{month}.jsonl` via `costLedger.js`
  - Rebuild: `seedBillingFromJsonl()` restores from JSONL if table is empty
  - `getSeedHash(sourceKey)` / `setSeedHash(sourceKey, hash)` — hash-gated reconciliation state stored in settings table under `_seed_hashes` section

## Public API (The Contract)

- `specDb.js` → `class SpecDb({ dbPath, category })` — main facade; instantiated via `serverBootstrap.js` DI
  - Component identity: `getComponentIdentity`, `upsertComponentIdentity`, `deleteComponentIdentityCascade`
  - Item state: `getItemState`, `setItemState`
  - Enum policy: `getEnumPolicy`, `setEnumPolicy`
  - Key review: `getKeyReviewState`, `setKeyReviewState`
  - Field candidates: `getTopFieldCandidate`, `getTopFieldCandidatesByProduct`
  - Source intel / product / telemetry stores
  - Source strategy and spec seed runtime projections
  - `close()` — cleanup
- `appDb.js` → `class AppDb({ dbPath })` — global singleton
  - Brands, settings, studio maps, color registry, unit registry
  - Billing: insert, rollup, snapshot, daily, entries, count
- `specDbSchema.js` → `SCHEMA` — DDL string for table/index creation
- `specDbHelpers.js` → `normalizeListLinkToken`, `expandListLinkValues`, `toPositiveInteger`, `toBoolInt`, `hydrateRow`, `hydrateRows`
- `specDbMigrations.js` → `applyMigrations(db)`, `MIGRATIONS`, `SECONDARY_INDEXES`
- `specDbIntegrity.js` → `cleanupLegacyIdentityFallbackRows`, `assertStrictIdentitySlotIntegrity`
- `specDbStatements.js` → `prepareStatements(db)` — compiled SQL
- `seed.js` → `seedSpecDb({ db, config, category, fieldRules, logger })`, `reEvaluateEnumPolicy`
- `seedRegistry.js` → `GLOBAL_SURFACES`, `buildCategorySurfaces(steps)`, `buildReseedSurfaces(deps)`, `topologicalSort(surfaces)`, `getSurfaceByKey(surfaces, key)` — central manifest of all seed surfaces (global metadata + category/reseed factories via DI)
- `seedEngine.js` → `runCategorySeed({ db, config, category, fieldRules, fieldMeta, logger, surfaces })` — generic orchestration loop for category surfaces (iterates in dependency order, hard-fail semantics)

## Dependencies (Allowed Imports)

- `better-sqlite3` (database driver)
- Node builtins (`path`, `fs`)
- Internal only: store modules import from sibling files within `src/db/`

**Forbidden:** `src/db/` must NOT import from `src/features/`, `src/app/api/`, or `src/pipeline/`.

## Mutation Boundaries

- SQLite database files: one per category (`spec.sqlite`), plus one global (`app.sqlite`)
- SpecDb: component_identity, enum/list, key_review, queue/product, telemetry indexes, crawl artifacts, runs, field_candidates, source_strategy, spec_seed_templates
- AppDb: brands, brand_categories, brand_renames, settings, studio_maps, color_registry, unit_registry, billing_entries
- SpecDb store modules: componentStore, enumListStore, itemStateStore, queueProductStore, sourceIntelStore, artifactStore, runMetaStore, runArtifactStore, telemetryIndexStore, purgeStore, fieldCandidateStore, sourceStrategyStore, specSeedStore, variant/progress stores
- Write access is through `SpecDb`/`AppDb` methods only — consumers must not use raw SQL

## Domain Invariants

- One `SpecDb` instance per category. Never share instances across categories.
- One `AppDb` instance globally. Billing is cross-category by design.
- All writes go through prepared statements.
- Migrations are applied automatically on `SpecDb` construction — always forward-only.
- `normalizeListLinkToken()` is the canonical normalizer for all token comparisons.
- Store modules receive `db` and `stmts` via constructor injection — no module-level state.
