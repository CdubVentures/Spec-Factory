## Purpose

SQLite-backed persistence layer for candidate data, review state, component identity, learning, billing, and queue management. Single `SpecDb` class provides a unified facade over 14 domain-specific store modules. Schema: 48 tables.

Additionally, `AppDb` (`appDb.js`) provides a shared cross-category database at `.workspace/db/app.sqlite` for global state: brands (34+), brand categories, brand renames, user settings (~170 keys), studio maps, and seed hash tracking. Opened once at bootstrap, shared across all categories.
  - `getSeedHash(sourceKey)` / `setSeedHash(sourceKey, hash)` — hash-gated reconciliation state stored in settings table under `_seed_hashes` section

## Public API (The Contract)

- `specDb.js` → `class SpecDb({ dbPath, category })` — main facade; instantiated via `serverBootstrap.js` DI
  - Candidate CRUD: `insertCandidate`, `queryCandidates`, `getCandidate`, `updateCandidate`
  - Review state: `insertReview`, `getReview`, `getReviews`
  - Component identity: `getComponentIdentity`, `upsertComponentIdentity`
  - Item state: `getItemState`, `setItemState`
  - Enum policy: `getEnumPolicy`, `setEnumPolicy`
  - Key review: `getKeyReviewState`, `setKeyReviewState`
  - Provenance: `getProvenanceForProduct(category, productId)` → flat `{ [fieldKey]: { value, confidence, host, evidence: [...] } }`
  - Normalized: `getNormalizedForProduct(productId)` → `{ identity: { brand, model, variant }, fields: { [fieldKey]: value } }`
  - Summary: `getSummaryForProduct(productId)` → full summary object from `product_runs.summary_json`
  - Traffic Light: `getTrafficLightForProduct(productId)` → `summary.traffic_light` extraction
  - Billing / source intel / queue product stores
  - `close()` — cleanup
- `specDbSchema.js` → `SCHEMA` — DDL string for table/index creation
- `specDbHelpers.js` → `normalizeListLinkToken`, `expandListLinkValues`, `toPositiveInteger`, `toBoolInt`, `toBand`, `buildDefaultLlmRoutes`
- `specDbMigrations.js` → `applyMigrations(db)`, `MIGRATIONS`, `SECONDARY_INDEXES`
- `specDbIntegrity.js` → `cleanupLegacyIdentityFallbackRows`, `assertStrictIdentitySlotIntegrity`
- `specDbStatements.js` → `prepareStatements(db)` — compiled SQL
- `seed.js` → `seedSpecDb({ db, config, category, fieldRules, logger })`, `reEvaluateEnumPolicy`

## Dependencies (Allowed Imports)

- `better-sqlite3` (database driver)
- Node builtins (`path`, `fs`)
- Internal only: store modules import from sibling files within `src/db/`

**Forbidden:** `src/db/` must NOT import from `src/features/`, `src/api/`, or `src/pipeline/`.

## Mutation Boundaries

- SQLite database files (one per category, located under INDEXLAB_ROOT)
- 48 tables across domains: candidates, component_identity, enum/list, item_field_state, key_review, billing, queue/product, llm_route/source, telemetry indexes, crawl artifacts, brand/domain, runs, field_history, source_corpus
- 13 store modules: candidateStore, componentStore, enumListStore, itemStateStore, keyReviewStore, queueProductStore, llmRouteSourceStore, sourceIntelStore, artifactStore, runMetaStore, runArtifactStore, billingStore, fieldHistoryStore, telemetryIndexStore, purgeStore, provenanceStore
- Write access is through `SpecDb` methods only — consumers must not use raw SQL

## Domain Invariants

- One `SpecDb` instance per category. Never share instances across categories.
- All writes go through prepared statements (`specDbStatements.js`).
- Migrations are applied automatically on `SpecDb` construction — always forward-only.
- `normalizeListLinkToken()` is the canonical normalizer for all token comparisons.
- Store modules receive `db` and `stmts` via constructor injection — no module-level state.
