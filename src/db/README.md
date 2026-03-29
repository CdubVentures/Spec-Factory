## Purpose

SQLite-backed persistence layer for candidate data, review state, component identity, learning, billing, and queue management. Single `SpecDb` class provides a unified facade over 9 domain-specific store modules.

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
- Tables: candidates, reviews, component_identity, item_field_state, enum_policy, key_review_state, billing, source_intel, queue_product, llm_route_source
- Write access is through `SpecDb` methods only — consumers must not use raw SQL

## Domain Invariants

- One `SpecDb` instance per category. Never share instances across categories.
- All writes go through prepared statements (`specDbStatements.js`).
- Migrations are applied automatically on `SpecDb` construction — always forward-only.
- `normalizeListLinkToken()` is the canonical normalizer for all token comparisons.
- Store modules receive `db` and `stmts` via constructor injection — no module-level state.
