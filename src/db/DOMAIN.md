# src/db — Domain Contract

## Boundary

SQLite persistence layer for all spec candidate, review, product, queue, billing, learning, and source intelligence data. Synchronous API via `better-sqlite3` with WAL journal mode.

## Public API

Single entry point: `export class SpecDb` from `specDb.js`.

All ~150 methods are callable on the `SpecDb` instance. The class is a **composition root** — it owns the database connection, compiles prepared statements once, and delegates to 9 domain stores.

## Architecture

```
specDb.js              — Composition root (680 LOC): constructor wiring, thin delegators, cascade helpers
specDbSchema.js        — DDL (SCHEMA constant) + LLM_ROUTE_BOOLEAN_KEYS
specDbHelpers.js       — 9 pure helper functions (normalizeListLinkToken, expandListLinkValues, toBoolInt, etc.)
specDbStatements.js    — prepareStatements(db) factory: compiles ~30 prepared statements
specDbMigrations.js    — applyMigrations(db): ALTER TABLE migrations
specDbIntegrity.js     — cleanupLegacyIdentityFallbackRows(db), assertStrictIdentitySlotIntegrity(db)

stores/
  candidateStore.js        — 11 methods: candidates + candidate_reviews tables
  itemStateStore.js        — 19 methods: item_field_state + item_component_links + item_list_links
  componentStore.js        — 17 methods: component_identity + component_aliases + component_values
  enumListStore.js         — 15 methods: enum_lists + list_values (cross-dep: key review store)
  keyReviewStore.js        — 15 methods: key_review_state + key_review_runs + key_review_run_sources + key_review_audit
  billingStore.js          —  5 methods: billing_entries
  sourceIntelStore.js      — 12 methods: llm_cache + source_corpus + runtime_events
  queueProductStore.js     — 24 methods: product_queue + product_runs + products + audit_log + curation_suggestions + component_review_queue
  llmRouteSourceStore.js   —  6 methods: llm_route_matrix + source_registry
```

## Pattern

Factory + Dependency Injection:
```javascript
export function createFooStore({ db, category, stmts }) {
  function method() { /* uses db, category, stmts */ }
  return { method };
}
```

## Key Design Decisions

- **Cascade helpers stay in composition root.** 4 cross-cutting methods (~220 LOC) that read from component store, item state store, and write directly to DB.
- **Lazy arrow functions for cross-domain deps.** `enumListStore` needs `keyReviewStore.deleteKeyReviewStateRowsByIds` — injected as `(...args) => this._keyReviewStore.deleteKeyReviewStateRowsByIds(...args)` to handle forward references.
- **Brand/domain + sync state stay inline.** 6 methods (~110 LOC) — too small for separate stores.

## Dependencies

- `better-sqlite3` — synchronous SQLite driver
- No other external dependencies

## Consumers

- `src/api/guiServer.js` — constructs SpecDb, passes to routes/services
- `src/app/api/specDbRuntime.js` — wraps SpecDb with lifecycle management
- `src/features/extraction/plugins/html/htmlArtifactPersister.js` — indexes HTML via `insertCrawlSource` (DI callback)
- 12+ test files directly import `SpecDb`
