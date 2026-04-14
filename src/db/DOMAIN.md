# src/db — Domain Contract

## Boundary

SQLite persistence layer for all spec candidate, review, product, queue, and source intelligence data. Synchronous API via `better-sqlite3` with WAL journal mode.

Two database classes:
- **SpecDb** — per-category (`spec.sqlite`): review state, components, enums, queue, telemetry, crawl artifacts
- **AppDb** — global (`app.sqlite`): brands, settings, studio maps, color/unit registries, billing

## Public API

**SpecDb:** `export class SpecDb` from `specDb.js`. All ~130 methods callable on the instance. Composition root — owns DB connection, compiles prepared statements, delegates to domain stores.

**AppDb:** `export class AppDb` from `appDb.js`. Global singleton opened at bootstrap. Brands, settings, billing, registries. Billing methods: `insertBillingEntry`, `getBillingRollup`, `getBillingEntriesForMonth`, `getBillingSnapshot`, `getGlobalDaily`, `getGlobalEntries`, `countBillingEntries`.

## Architecture

```
specDb.js              — SpecDb composition root: constructor wiring, thin delegators, cascade helpers
specDbSchema.js        — DDL (SCHEMA constant) + LLM_ROUTE_BOOLEAN_KEYS
specDbHelpers.js       — 9 pure helper functions (normalizeListLinkToken, expandListLinkValues, toBoolInt, etc.)
specDbStatements.js    — prepareStatements(db) factory: compiles ~30 prepared statements
specDbMigrations.js    — applyMigrations(db): ALTER TABLE migrations
specDbIntegrity.js     — cleanupLegacyIdentityFallbackRows(db), assertStrictIdentitySlotIntegrity(db)

appDb.js               — AppDb class: brands, settings, studio maps, registries, billing
appDbSchema.js         — DDL for app.sqlite (brands, settings, billing_entries, etc.)
appDbSeed.js           — Hash-gated reconcile + seedBillingFromJsonl() rebuild contract

stores/
  itemStateStore.js        — 19 methods: item_field_state + item_component_links + item_list_links
  componentStore.js        — 17 methods: component_identity + component_aliases + component_values
  enumListStore.js         — 15 methods: enum_lists + list_values
  sourceIntelStore.js      —  3 methods: bridge_events
  queueProductStore.js     —  4 methods: products
  llmRouteSourceStore.js   —  4 methods: llm_route_matrix
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
- **Billing is global (AppDb), not per-category.** Billing entries from all categories live in one `billing_entries` table in `app.sqlite`. Dual-written to JSONL for rebuild contract.

## Dependencies

- `better-sqlite3` — synchronous SQLite driver
- No other external dependencies

## Consumers

- `src/app/api/guiServer.js` — constructs SpecDb, passes to routes/services
- `src/app/api/specDbRuntime.js` — wraps SpecDb with lifecycle management
- `src/app/api/bootstrap/createBootstrapSessionLayer.js` — constructs AppDb, seeds billing from JSONL
- `src/features/extraction/plugins/html/htmlArtifactPersister.js` — indexes HTML via `insertCrawlSource` (DI callback)
- 12+ test files directly import `SpecDb`
