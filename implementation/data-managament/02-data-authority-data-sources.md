# 02 - Data Authority Data Sources

Last verified: 2026-02-23

## Source inventory

| Layer | Source | Path or table | Primary writers | Primary readers |
|---|---|---|---|---|
| Authoring control plane | Workbook map | `helper_files/{category}/_control_plane/workbook_map.json` | `PUT /studio/{category}/workbook-map` | Studio mapping queries, compile |
| Authoring control plane | Draft field rules | `helper_files/{category}/_control_plane/field_rules_draft.json` | `POST /studio/{category}/save-drafts` | `sessionCache.getSessionRules`, Studio payload, review payload builders |
| Authoring control plane | UI field catalog draft | `helper_files/{category}/_control_plane/ui_field_catalog_draft.json` | `POST /studio/{category}/save-drafts` | Studio draft endpoint |
| Authoring control plane | Pending renames | `helper_files/{category}/_control_plane/pending_renames.json` | `POST /studio/{category}/save-drafts` | compile/migration flows |
| Authoring control plane | Product catalog | `helper_files/{category}/_control_plane/product_catalog.json` | catalog routes, compile utilities | Studio workbook products, seed |
| Generated artifacts | Field rules | `helper_files/{category}/_generated/field_rules.json` (fallback `field_rules.runtime.json`) | category compile | `loadCategoryConfig` |
| Generated artifacts | UI catalog | `helper_files/{category}/_generated/ui_field_catalog.json` | category compile | Studio payload |
| Generated artifacts | Known values | `helper_files/{category}/_generated/known_values.json` | category compile | Studio known-values, seed |
| Generated artifacts | Component DB | `helper_files/{category}/_generated/component_db/*.json` | category compile | Studio component-db, seed |
| Generated artifacts | Manifest | `helper_files/{category}/_generated/manifest.json` | category compile | `sessionCache` compile staleness |
| Suggestions | Enum/component/review suggestions | `helper_files/{category}/_suggestions/*.json` | runtime extraction/review flows | seed, test mode, review routes |
| Queue JSON | Queue state | `_queue/{category}/state.json` (legacy read: `helper_files/{category}/_queue/state.json`) | queue/cascade flows | seed, runtime queue surfaces |
| SQL authority | Sync state | `data_authority_sync` | `recordSpecDbSync` | snapshot endpoint, compile metadata |
| SQL authority | Source strategy | `source_strategy` | `/source-strategy` routes, seed defaults | source strategy APIs |
| SQL runtime | Product queue | `product_queue` | queue/cascade/catalog mutation paths | queue APIs, seed/reporting |
| SQL runtime | Review/source tables | `key_review_*`, `source_*`, `component_*`, `list_*`, `item_*` | review mutation routes, seed | review payload builders |

## Data precedence rules

1. Compiled generated rules provide the baseline (`loadCategoryConfig`).
2. Draft rules override baseline via `sessionCache` deep merge.
3. Draft field order overrides compiled order; group markers (`__grp::`) preserved.
4. Authority snapshot token is derived from draft timestamp, compiled timestamp, and SpecDb sync version.

## Identity mapping keys (runtime)

- candidate identity: `candidates.candidate_id`
- source identity: `source_registry.source_id`
- assertion identity: `source_assertions.assertion_id` (aligned to candidate identity in seeding flow)
- slot links:
  - `source_assertions.item_field_state_id`
  - `source_assertions.component_value_id`
  - `source_assertions.list_value_id`
  - `source_assertions.enum_list_id`

## API views over authority

- `GET /api/v1/studio/{category}/payload`
  - merged `fieldRules` + merged `fieldOrder` + compile/draft timestamps
- `GET /api/v1/studio/{category}/workbook-map`
  - normalized workbook map
- `GET /api/v1/studio/{category}/drafts`
  - persisted draft payloads
- `GET /api/v1/data-authority/{category}/snapshot`
  - authority token, changed domains, sync metadata, observability counters

## Compile and projection path

1. `POST /studio/{category}/compile` starts category compile process.
2. Process completion handler runs `syncSpecDbForCategory`.
3. `seedSpecDb` derives SQL projection from JSON/contracts.
4. `recordSpecDbSync` writes versioned sync status.
5. `process-completed` event broadcasts sync metadata for consumers.

## Risk notes

- If sync fails after compile success, authority can be JSON-fresh and SQL-stale; failure state is durable in `data_authority_sync`.
- Event delivery is best-effort; UI safety net is snapshot polling plus invalidation.
