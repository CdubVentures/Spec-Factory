# Data Model

> **Purpose:** Document the live AppDb and SpecDb schema, migration deltas, and canonical-versus-derived data boundaries with exact file paths.
> **Prerequisites:** [backend-architecture.md](./backend-architecture.md), [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md)
> **Last validated:** 2026-04-07

## Persistence Topology

| Surface | Path | Role |
|--------|------|------|
| AppDb schema DDL | `src/db/appDbSchema.js` | global SQLite schema for brands, settings, studio maps, and color registry |
| AppDb runtime | `src/db/appDb.js` | eager global SQLite composition root |
| AppDb bootstrap owner | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | opens `.workspace/db/app.sqlite` and seeds global tables |
| SpecDb schema DDL | `src/db/specDbSchema.js` | per-category SQLite schema for review, queue, telemetry, and artifact indexes |
| SpecDb migrations | `src/db/specDbMigrations.js` | additive and cleanup migrations applied after base schema creation |
| SpecDb runtime | `src/db/specDb.js` | per-category SQLite composition root |
| SpecDb lifecycle | `src/app/api/specDbRuntime.js` | lazy open, auto-seed, hash reconcile, and reseed phases |
| Seed/sync path | `src/app/api/services/specDbSyncService.js`, `src/db/seed.js` | projects category-authority data into SpecDb |
| File-backed control plane | `category_authority/` | source JSON and generated artifacts consumed by seeding and runtime lookups |

## Canonical Vs Derived Data

| Data family | Canonical owner | Derived or mirrored surfaces |
|-------------|-----------------|------------------------------|
| global brands | AppDb `brands`, `brand_categories`, `brand_renames` | category-aware brand selectors and catalog flows |
| persisted operator settings | AppDb `settings` plus `src/features/settings-authority/userSettingsService.js` | runtime config overlays and GUI hydration stores |
| global color registry | AppDb `color_registry` | GUI `/colors` surface and color-aware feature flows |
| category review/component/list state | per-category SpecDb tables | GUI review pages, queue metrics, runtime analytics |
| category authority rules and generated JSON | `category_authority/` | seeded/mirrored into SpecDb by `src/db/seed.js` and reseed helpers |
| runtime artifacts and run directories | `.workspace/output`, `.workspace/runs` | indexed in SpecDb via `runs`, `run_artifacts`, `crawl_sources`, telemetry tables |

## Migration Path

1. `src/db/appDb.js` executes `APP_DB_SCHEMA` from `src/db/appDbSchema.js` when AppDb opens.
2. `src/db/specDb.js` executes `SCHEMA` from `src/db/specDbSchema.js` when each category SpecDb opens.
3. The same constructor runs `applyMigrations()` from `src/db/specDbMigrations.js`.
4. `src/app/api/specDbRuntime.js` then triggers seed, reconcile, and reseed paths through `src/app/api/services/specDbSyncService.js`.

## Live Migration Deltas

These columns and table changes are not just historical notes; they are part of the current live DB shape.

| Table | Migration effect | Source |
|-------|------------------|--------|
| `component_identity` | adds `review_status`, `aliases_overridden` | `src/db/specDbMigrations.js` |
| `component_values` | adds `constraints` | `src/db/specDbMigrations.js` |
| `list_values` | adds `source_timestamp` and hardens `list_id` usage | `src/db/specDbMigrations.js` |
| `item_field_state` | adds override provenance columns | `src/db/specDbMigrations.js` |
| `product_runs` | adds `storage_state`, `local_path`, `s3_key`, `size_bytes`, `relocated_at` | `src/db/specDbMigrations.js` |
| `products` | adds `brand_identifier`, `base_model` | `src/db/specDbMigrations.js` |
| `query_index` | adds `tier` | `src/db/specDbMigrations.js` |
| `runs` | renames `phase_cursor` to `stage_cursor` | `src/db/specDbMigrations.js` |
| SpecDb retired tables | drops legacy `brands` and `artifacts` tables from SpecDb | `src/db/specDbMigrations.js` |

## AppDb

AppDb is global and eagerly opened at `.workspace/db/app.sqlite` by `src/app/api/bootstrap/createBootstrapSessionLayer.js`.

### `brands`

Table constraints: primary key on `identifier`; unique slug index `idx_brands_slug`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `identifier` | `TEXT` | `PRIMARY KEY` | stable brand identity key |
| `canonical_name` | `TEXT` | `NOT NULL` | operator-facing display name |
| `slug` | `TEXT` | `NOT NULL` | unique lookup slug |
| `aliases` | `TEXT` | `NOT NULL DEFAULT '[]'` | JSON array of alias strings |
| `website` | `TEXT` | `NOT NULL DEFAULT ''` | brand homepage |
| `added_by` | `TEXT` | `NOT NULL DEFAULT 'seed'` | seed vs operator provenance |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

### `brand_categories`

Table constraints: composite primary key on (`identifier`, `category`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `identifier` | `TEXT` | `NOT NULL REFERENCES brands(identifier) ON DELETE CASCADE` | joins to `brands` |
| `category` | `TEXT` | `NOT NULL` | category slug |

### `brand_renames`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `identifier` | `TEXT` | `NOT NULL REFERENCES brands(identifier)` | renamed brand |
| `old_slug` | `TEXT` | `NOT NULL` | previous slug |
| `new_slug` | `TEXT` | `NOT NULL` | replacement slug |
| `old_name` | `TEXT` | `NOT NULL` | previous name |
| `new_name` | `TEXT` | `NOT NULL` | replacement name |
| `renamed_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | rename timestamp |

### `settings`

Table constraints: composite primary key on (`section`, `key`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `section` | `TEXT` | `NOT NULL` | top-level settings section |
| `key` | `TEXT` | `NOT NULL` | settings key within section |
| `value` | `TEXT` |  | serialized value |
| `type` | `TEXT` | `NOT NULL DEFAULT 'string'` | primitive type hint |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

### `studio_maps`

Table constraints: primary key on `category`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `NOT NULL` | category slug |
| `map_json` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized studio map |
| `file_path` | `TEXT` | `NOT NULL DEFAULT ''` | backing file path when mirrored |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

### `color_registry`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `name` | `TEXT` | `PRIMARY KEY` | normalized color token |
| `hex` | `TEXT` | `NOT NULL` | `#RRGGBB` value |
| `css_var` | `TEXT` | `NOT NULL` | CSS variable name |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

## SpecDb: Review State And Normalized Entity Tables

Each category gets its own SpecDb at `.workspace/db/<category>/spec.sqlite`.

### `component_values`

Table constraints: `UNIQUE(category, component_type, component_name, component_maker, property_key)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `component_type` | `TEXT` | `NOT NULL` | normalized component family |
| `component_name` | `TEXT` | `NOT NULL` | canonical or matched component name |
| `component_maker` | `TEXT` | `DEFAULT ''` | maker/manufacturer token |
| `component_identity_id` | `INTEGER` | `REFERENCES component_identity(id)` | joins to identity row |
| `property_key` | `TEXT` | `NOT NULL` | component property name |
| `value` | `TEXT` |  | normalized property value |
| `confidence` | `REAL` | `DEFAULT 1.0` | confidence score |
| `variance_policy` | `TEXT` |  | comparison/variance mode |
| `constraints` | `TEXT` |  | migration-added serialized constraints payload |
| `source` | `TEXT` | `DEFAULT 'component_db'` | provenance label |
| `accepted_candidate_id` | `TEXT` |  | accepted candidate pointer |
| `needs_review` | `INTEGER` | `DEFAULT 0` | review flag |
| `overridden` | `INTEGER` | `DEFAULT 0` | operator override flag |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `component_identity`

Table constraints: `UNIQUE(category, component_type, canonical_name, maker)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `component_type` | `TEXT` | `NOT NULL` | normalized component family |
| `canonical_name` | `TEXT` | `NOT NULL` | canonical component name |
| `maker` | `TEXT` | `DEFAULT ''` | maker/manufacturer token |
| `links` | `TEXT` |  | serialized link metadata |
| `source` | `TEXT` | `DEFAULT 'component_db'` | provenance label |
| `review_status` | `TEXT` | `DEFAULT 'pending'` | migration-added review status |
| `aliases_overridden` | `INTEGER` | `DEFAULT 0` | migration-added alias override flag |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `component_aliases`

Table constraints: `UNIQUE(component_id, alias)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `component_id` | `INTEGER` | `NOT NULL REFERENCES component_identity(id)` | parent identity |
| `alias` | `TEXT` | `NOT NULL` | alias token |
| `source` | `TEXT` | `DEFAULT 'component_db'` | provenance label |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `enum_lists`

Table constraints: `UNIQUE(category, field_key)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `source` | `TEXT` | `DEFAULT 'field_rules'` | provenance label |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `list_values`

Table constraints: `UNIQUE(category, field_key, value)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `list_id` | `INTEGER` | `NOT NULL REFERENCES enum_lists(id)` | parent enum list |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `value` | `TEXT` | `NOT NULL` | accepted enum value |
| `normalized_value` | `TEXT` |  | normalized comparison token |
| `source` | `TEXT` | `DEFAULT 'known_values'` | provenance label |
| `accepted_candidate_id` | `TEXT` |  | accepted candidate pointer |
| `enum_policy` | `TEXT` |  | enum handling policy |
| `source_timestamp` | `TEXT` |  | migration-added source timestamp |
| `needs_review` | `INTEGER` | `DEFAULT 0` | review flag |
| `overridden` | `INTEGER` | `DEFAULT 0` | operator override flag |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `item_field_state`

Table constraints: `UNIQUE(category, product_id, field_key)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `value` | `TEXT` |  | accepted scalar value |
| `confidence` | `REAL` | `DEFAULT 0` | confidence score |
| `source` | `TEXT` | `DEFAULT 'pipeline'` | provenance label |
| `accepted_candidate_id` | `TEXT` |  | accepted candidate pointer |
| `overridden` | `INTEGER` | `DEFAULT 0` | operator override flag |
| `needs_ai_review` | `INTEGER` | `DEFAULT 0` | review-needed flag |
| `ai_review_complete` | `INTEGER` | `DEFAULT 0` | review-complete flag |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `override_source` | `TEXT` |  | migration-added override source |
| `override_value` | `TEXT` |  | migration-added operator override value |
| `override_reason` | `TEXT` |  | migration-added override reason |
| `override_provenance` | `TEXT` |  | migration-added provenance blob |
| `overridden_by` | `TEXT` |  | migration-added actor id |
| `overridden_at` | `TEXT` |  | migration-added timestamp |

### `product_review_state`

Table constraints: `UNIQUE(category, product_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `review_status` | `TEXT` | `DEFAULT 'pending'` | overall review state |
| `review_started_at` | `TEXT` |  | timestamp |
| `reviewed_by` | `TEXT` |  | actor id |
| `reviewed_at` | `TEXT` |  | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `item_component_links`

Table constraints: `UNIQUE(category, product_id, field_key)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `component_type` | `TEXT` | `NOT NULL` | component family |
| `component_name` | `TEXT` | `NOT NULL` | matched component name |
| `component_maker` | `TEXT` | `DEFAULT ''` | maker/manufacturer token |
| `match_type` | `TEXT` |  | match strategy |
| `match_score` | `REAL` |  | match score |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `item_list_links`

Table constraints: `UNIQUE(category, product_id, field_key, list_value_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `list_value_id` | `INTEGER` | `REFERENCES list_values(id)` | linked enum value |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

## SpecDb: Catalog, Queue, And Route-Matrix Tables

### `products`

Table constraints: `UNIQUE(category, product_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `brand` | `TEXT` | `DEFAULT ''` | display brand token |
| `model` | `TEXT` | `DEFAULT ''` | model name |
| `base_model` | `TEXT` | `DEFAULT ''` | migration-added model family |
| `variant` | `TEXT` | `DEFAULT ''` | variant token |
| `status` | `TEXT` | `DEFAULT 'active'` | product lifecycle state |
| `identifier` | `TEXT` |  | stable external identity lock |
| `brand_identifier` | `TEXT` | `DEFAULT ''` | migration-added AppDb brand join key |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `product_queue`

Table constraints: `UNIQUE(category, product_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `s3key` | `TEXT` | `DEFAULT ''` | legacy storage-location field name still present in live DB |
| `status` | `TEXT` | `DEFAULT 'pending'` | queue state |
| `priority` | `INTEGER` | `DEFAULT 3` | queue priority |
| `attempts_total` | `INTEGER` | `DEFAULT 0` | cumulative attempts |
| `retry_count` | `INTEGER` | `DEFAULT 0` | current retry count |
| `max_attempts` | `INTEGER` | `DEFAULT 3` | retry ceiling |
| `next_retry_at` | `TEXT` |  | timestamp |
| `last_run_id` | `TEXT` |  | most recent run id |
| `cost_usd_total` | `REAL` | `DEFAULT 0` | cumulative spend |
| `rounds_completed` | `INTEGER` | `DEFAULT 0` | completed rounds |
| `next_action_hint` | `TEXT` |  | operator/runtime hint |
| `last_urls_attempted` | `TEXT` |  | serialized attempted URLs |
| `last_error` | `TEXT` |  | latest error string |
| `last_started_at` | `TEXT` |  | timestamp |
| `last_completed_at` | `TEXT` |  | timestamp |
| `dirty_flags` | `TEXT` |  | serialized dirty-state payload |
| `last_summary` | `TEXT` |  | serialized last-summary blob |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `curation_suggestions`

Table constraints: `UNIQUE(category, suggestion_type, field_key, value)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `suggestion_id` | `TEXT` | `NOT NULL` | stable suggestion token |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `suggestion_type` | `TEXT` | `NOT NULL` | suggestion family |
| `field_key` | `TEXT` |  | related field |
| `component_type` | `TEXT` |  | related component family |
| `value` | `TEXT` | `NOT NULL` | suggested value |
| `normalized_value` | `TEXT` |  | normalized token |
| `status` | `TEXT` | `DEFAULT 'pending'` | triage state |
| `source` | `TEXT` |  | provenance label |
| `product_id` | `TEXT` |  | product identifier |
| `run_id` | `TEXT` |  | source run id |
| `first_seen_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `last_seen_at` | `TEXT` |  | timestamp |
| `reviewed_by` | `TEXT` |  | actor id |
| `reviewed_at` | `TEXT` |  | timestamp |
| `review_note` | `TEXT` |  | operator note |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `component_review_queue`

Table constraints: `UNIQUE(review_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `review_id` | `TEXT` | `NOT NULL` | stable queue item token |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `component_type` | `TEXT` | `NOT NULL` | component family |
| `field_key` | `TEXT` |  | related field |
| `raw_query` | `TEXT` |  | unresolved search/query text |
| `matched_component` | `TEXT` |  | matched name candidate |
| `match_type` | `TEXT` |  | matching mode |
| `name_score` | `REAL` |  | name-match score |
| `property_score` | `REAL` |  | property-match score |
| `combined_score` | `REAL` |  | combined score |
| `alternatives` | `TEXT` |  | serialized alternatives list |
| `product_id` | `TEXT` |  | product identifier |
| `run_id` | `TEXT` |  | source run id |
| `status` | `TEXT` | `DEFAULT 'pending_ai'` | queue state |
| `ai_decision` | `TEXT` |  | AI outcome |
| `ai_suggested_name` | `TEXT` |  | AI suggestion |
| `ai_suggested_maker` | `TEXT` |  | AI suggestion |
| `ai_reviewed_at` | `TEXT` |  | timestamp |
| `product_attributes` | `TEXT` |  | serialized product context |
| `reasoning_note` | `TEXT` |  | AI/operator explanation |
| `human_reviewed_at` | `TEXT` |  | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `product_runs`

Table constraints: `UNIQUE(category, product_id, run_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `run_id` | `TEXT` | `NOT NULL` | run identifier |
| `is_latest` | `INTEGER` | `DEFAULT 1` | latest-run marker |
| `summary_json` | `TEXT` |  | serialized summary |
| `validated` | `INTEGER` | `DEFAULT 0` | validation flag |
| `confidence` | `REAL` | `DEFAULT 0` | run confidence |
| `cost_usd_run` | `REAL` | `DEFAULT 0` | run cost |
| `sources_attempted` | `INTEGER` | `DEFAULT 0` | source count |
| `run_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `storage_state` | `TEXT` | `DEFAULT 'live'` | migration-added storage status |
| `local_path` | `TEXT` | `DEFAULT ''` | migration-added local path |
| `s3_key` | `TEXT` | `DEFAULT ''` | migration-added legacy relocation field |
| `size_bytes` | `INTEGER` | `DEFAULT 0` | migration-added artifact size |
| `relocated_at` | `TEXT` | `DEFAULT ''` | migration-added relocation timestamp |

### `llm_route_matrix`

Table constraints: `UNIQUE(category, route_key)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `scope` | `TEXT` | `NOT NULL CHECK(scope IN ('field', 'component', 'list'))` | route scope |
| `route_key` | `TEXT` | `NOT NULL` | stable matrix key |
| `required_level` | `TEXT` | `NOT NULL` | evidence threshold bucket |
| `difficulty` | `TEXT` | `NOT NULL` | difficulty bucket |
| `availability` | `TEXT` | `NOT NULL` | availability bucket |
| `effort` | `INTEGER` | `NOT NULL DEFAULT 3` | effort value |
| `effort_band` | `TEXT` | `NOT NULL DEFAULT '1-3'` | effort band |
| `single_source_data` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean flag |
| `all_source_data` | `INTEGER` | `NOT NULL DEFAULT 0` | boolean flag |
| `enable_websearch` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean flag |
| `model_ladder_today` | `TEXT` | `NOT NULL` | model routing ladder |
| `all_sources_confidence_repatch` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean flag |
| `max_tokens` | `INTEGER` | `NOT NULL DEFAULT 4096` | token ceiling |
| `studio_key_navigation_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_contract_rules_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_extraction_guidance_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_tooltip_or_description_sent_when_present` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_enum_options_sent_when_present` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_component_variance_constraints_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_parse_template_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_ai_mode_difficulty_effort_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_required_level_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_component_entity_set_sent_when_component_field` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_evidence_policy_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_variance_policy_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_constraints_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` | boolean prompt flag |
| `studio_send_booleans_prompted_to_model` | `INTEGER` | `NOT NULL DEFAULT 0` | boolean prompt flag |
| `scalar_linked_send` | `TEXT` | `NOT NULL DEFAULT 'scalar value + prime sources'` | scalar send mode |
| `component_values_send` | `TEXT` | `NOT NULL DEFAULT 'component values + prime sources'` | component send mode |
| `list_values_send` | `TEXT` | `NOT NULL DEFAULT 'list values prime sources'` | list send mode |
| `llm_output_min_evidence_refs_required` | `INTEGER` | `NOT NULL DEFAULT 1` | min evidence refs |
| `insufficient_evidence_action` | `TEXT` | `NOT NULL DEFAULT 'threshold_unmet'` | fallback action |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

## SpecDb: Key-Review Workflow Tables

Important uniqueness rules are enforced by indexes in `src/db/specDbSchema.js` and `src/db/specDbMigrations.js`:

- `ux_krs_grid`, `ux_krs_enum`, `ux_krs_component`
- `ux_krs_grid_slot`, `ux_krs_enum_slot`, `ux_krs_component_slot`, `ux_krs_component_identity_slot`

### `key_review_state`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `target_kind` | `TEXT` | `NOT NULL CHECK(target_kind IN ('grid_key','enum_key','component_key'))` | workflow lane |
| `item_identifier` | `TEXT` |  | grid-key item identifier |
| `field_key` | `TEXT` | `NOT NULL` | field identifier |
| `enum_value_norm` | `TEXT` |  | enum-key normalized value |
| `component_identifier` | `TEXT` |  | component-key identifier |
| `property_key` | `TEXT` |  | component property key |
| `item_field_state_id` | `INTEGER` | `REFERENCES item_field_state(id)` | grid slot FK |
| `component_value_id` | `INTEGER` | `REFERENCES component_values(id)` | component slot FK |
| `component_identity_id` | `INTEGER` | `REFERENCES component_identity(id)` | component identity FK |
| `list_value_id` | `INTEGER` | `REFERENCES list_values(id)` | enum slot FK |
| `enum_list_id` | `INTEGER` | `REFERENCES enum_lists(id)` | enum list FK |
| `required_level` | `TEXT` |  | review threshold |
| `availability` | `TEXT` |  | availability bucket |
| `difficulty` | `TEXT` |  | difficulty bucket |
| `effort` | `INTEGER` |  | effort value |
| `ai_mode` | `TEXT` |  | AI mode |
| `parse_template` | `TEXT` |  | template token |
| `evidence_policy` | `TEXT` |  | evidence policy |
| `min_evidence_refs_effective` | `INTEGER` | `DEFAULT 1` | effective evidence floor |
| `min_distinct_sources_required` | `INTEGER` | `DEFAULT 1` | source floor |
| `send_mode` | `TEXT` | `CHECK(send_mode IN ('single_source_data','all_source_data'))` | scalar send mode |
| `component_send_mode` | `TEXT` | `CHECK(component_send_mode IN ('component_values','component_values_prime_sources'))` | component send mode |
| `list_send_mode` | `TEXT` | `CHECK(list_send_mode IN ('list_values','list_values_prime_sources'))` | list send mode |
| `selected_value` | `TEXT` |  | accepted/reviewed value |
| `selected_candidate_id` | `TEXT` |  | selected candidate pointer |
| `confidence_score` | `REAL` | `DEFAULT 0` | confidence score |
| `confidence_level` | `TEXT` |  | confidence bucket |
| `flagged_at` | `TEXT` |  | timestamp |
| `resolved_at` | `TEXT` |  | timestamp |
| `ai_confirm_primary_status` | `TEXT` |  | AI primary-lane status |
| `ai_confirm_primary_confidence` | `REAL` |  | AI confidence |
| `ai_confirm_primary_at` | `TEXT` |  | timestamp |
| `ai_confirm_primary_interrupted` | `INTEGER` | `DEFAULT 0` | interruption flag |
| `ai_confirm_primary_error` | `TEXT` |  | error text |
| `ai_confirm_shared_status` | `TEXT` |  | shared-lane status |
| `ai_confirm_shared_confidence` | `REAL` |  | AI confidence |
| `ai_confirm_shared_at` | `TEXT` |  | timestamp |
| `ai_confirm_shared_interrupted` | `INTEGER` | `DEFAULT 0` | interruption flag |
| `ai_confirm_shared_error` | `TEXT` |  | error text |
| `user_accept_primary_status` | `TEXT` |  | operator primary decision |
| `user_accept_primary_at` | `TEXT` |  | timestamp |
| `user_accept_primary_by` | `TEXT` |  | actor id |
| `user_accept_shared_status` | `TEXT` |  | operator shared decision |
| `user_accept_shared_at` | `TEXT` |  | timestamp |
| `user_accept_shared_by` | `TEXT` |  | actor id |
| `user_override_ai_primary` | `INTEGER` | `DEFAULT 0` | override flag |
| `user_override_ai_primary_at` | `TEXT` |  | timestamp |
| `user_override_ai_primary_reason` | `TEXT` |  | operator reason |
| `user_override_ai_shared` | `INTEGER` | `DEFAULT 0` | override flag |
| `user_override_ai_shared_at` | `TEXT` |  | timestamp |
| `user_override_ai_shared_reason` | `TEXT` |  | operator reason |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `key_review_runs`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `run_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `key_review_state_id` | `INTEGER` | `NOT NULL REFERENCES key_review_state(id)` | parent review state |
| `stage` | `TEXT` | `NOT NULL` | review stage |
| `status` | `TEXT` | `NOT NULL` | run outcome |
| `provider` | `TEXT` |  | LLM provider |
| `model_used` | `TEXT` |  | model id |
| `prompt_hash` | `TEXT` |  | prompt fingerprint |
| `response_schema_version` | `TEXT` |  | response schema version |
| `input_tokens` | `INTEGER` |  | token count |
| `output_tokens` | `INTEGER` |  | token count |
| `latency_ms` | `INTEGER` |  | latency |
| `cost_usd` | `REAL` |  | call cost |
| `error` | `TEXT` |  | error text |
| `started_at` | `TEXT` |  | timestamp |
| `finished_at` | `TEXT` |  | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `key_review_run_sources`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `key_review_run_id` | `INTEGER` | `NOT NULL REFERENCES key_review_runs(run_id)` | parent run |
| `assertion_id` | `TEXT` | `NOT NULL` | evidence/assertion token |
| `packet_role` | `TEXT` |  | packet role |
| `position` | `INTEGER` |  | ordering index |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `key_review_audit`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `event_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `key_review_state_id` | `INTEGER` | `NOT NULL REFERENCES key_review_state(id)` | parent review state |
| `event_type` | `TEXT` | `NOT NULL` | audit event type |
| `actor_type` | `TEXT` | `NOT NULL` | actor kind |
| `actor_id` | `TEXT` |  | actor id |
| `old_value` | `TEXT` |  | previous value |
| `new_value` | `TEXT` |  | new value |
| `reason` | `TEXT` |  | explanation |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

## SpecDb: Operational, Artifact, And Telemetry Tables

### `billing_entries`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `ts` | `TEXT` | `NOT NULL` | event timestamp |
| `month` | `TEXT` | `NOT NULL` | billing month bucket |
| `day` | `TEXT` | `NOT NULL` | billing day bucket |
| `provider` | `TEXT` | `NOT NULL DEFAULT 'unknown'` | provider id |
| `model` | `TEXT` | `NOT NULL DEFAULT 'unknown'` | model id |
| `category` | `TEXT` | `DEFAULT ''` | category slug |
| `product_id` | `TEXT` | `DEFAULT ''` | product identifier |
| `run_id` | `TEXT` | `DEFAULT ''` | run identifier |
| `round` | `INTEGER` | `DEFAULT 0` | round index |
| `prompt_tokens` | `INTEGER` | `DEFAULT 0` | token count |
| `completion_tokens` | `INTEGER` | `DEFAULT 0` | token count |
| `cached_prompt_tokens` | `INTEGER` | `DEFAULT 0` | cached token count |
| `total_tokens` | `INTEGER` | `DEFAULT 0` | total tokens |
| `cost_usd` | `REAL` | `DEFAULT 0` | spend |
| `reason` | `TEXT` | `DEFAULT 'extract'` | usage reason |
| `host` | `TEXT` | `DEFAULT ''` | source host |
| `url_count` | `INTEGER` | `DEFAULT 0` | URL count |
| `evidence_chars` | `INTEGER` | `DEFAULT 0` | evidence character count |
| `estimated_usage` | `INTEGER` | `DEFAULT 0` | estimated usage value |
| `meta` | `TEXT` | `DEFAULT '{}'` | serialized metadata |

### `data_authority_sync`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `PRIMARY KEY` | category slug |
| `specdb_sync_version` | `INTEGER` | `NOT NULL DEFAULT 0` | sync version counter |
| `last_sync_status` | `TEXT` | `DEFAULT 'unknown'` | sync status |
| `last_sync_at` | `TEXT` |  | last sync timestamp |
| `last_sync_meta` | `TEXT` | `DEFAULT '{}'` | serialized sync metadata |

### `bridge_events`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `run_id` | `TEXT` | `NOT NULL DEFAULT ''` | run identifier |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | category slug |
| `product_id` | `TEXT` | `NOT NULL DEFAULT ''` | product identifier |
| `ts` | `TEXT` | `NOT NULL` | event timestamp |
| `stage` | `TEXT` | `NOT NULL DEFAULT ''` | runtime stage |
| `event` | `TEXT` | `NOT NULL DEFAULT ''` | event name |
| `payload` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized event payload |

### `runs`

Table constraints: `UNIQUE(run_id)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `run_id` | `TEXT` | `NOT NULL DEFAULT ''` | run identifier |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | category slug |
| `product_id` | `TEXT` | `NOT NULL DEFAULT ''` | product identifier |
| `status` | `TEXT` | `NOT NULL DEFAULT 'running'` | runtime status |
| `started_at` | `TEXT` | `NOT NULL DEFAULT ''` | start timestamp |
| `ended_at` | `TEXT` | `NOT NULL DEFAULT ''` | end timestamp |
| `stage_cursor` | `TEXT` | `NOT NULL DEFAULT ''` | renamed from `phase_cursor` by migration |
| `identity_fingerprint` | `TEXT` | `NOT NULL DEFAULT ''` | identity fingerprint |
| `identity_lock_status` | `TEXT` | `NOT NULL DEFAULT ''` | identity-lock state |
| `dedupe_mode` | `TEXT` | `NOT NULL DEFAULT ''` | dedupe mode |
| `s3key` | `TEXT` | `NOT NULL DEFAULT ''` | legacy storage-location field name |
| `out_root` | `TEXT` | `NOT NULL DEFAULT ''` | output root path |
| `counters` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized counters map |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `run_artifacts`

Table constraints: `UNIQUE(run_id, artifact_type)`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `run_id` | `TEXT` | `NOT NULL DEFAULT ''` | run identifier |
| `artifact_type` | `TEXT` | `NOT NULL DEFAULT ''` | artifact key |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | category slug |
| `payload` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized artifact payload |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `crawl_sources`

Table constraints: composite primary key on (`content_hash`, `product_id`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `content_hash` | `TEXT` | `NOT NULL` | content-addressed hash |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `run_id` | `TEXT` | `NOT NULL` | run identifier |
| `source_url` | `TEXT` | `NOT NULL` | original source URL |
| `final_url` | `TEXT` | `NOT NULL DEFAULT ''` | resolved final URL |
| `host` | `TEXT` | `NOT NULL DEFAULT ''` | host |
| `http_status` | `INTEGER` | `DEFAULT 0` | HTTP status |
| `doc_kind` | `TEXT` | `NOT NULL DEFAULT 'other'` | artifact kind |
| `source_tier` | `INTEGER` | `DEFAULT 5` | source tier |
| `content_type` | `TEXT` | `NOT NULL DEFAULT ''` | MIME/content type |
| `size_bytes` | `INTEGER` | `DEFAULT 0` | file size |
| `file_path` | `TEXT` | `NOT NULL DEFAULT ''` | local file path |
| `has_screenshot` | `INTEGER` | `DEFAULT 0` | screenshot flag |
| `has_pdf` | `INTEGER` | `DEFAULT 0` | PDF flag |
| `has_ldjson` | `INTEGER` | `DEFAULT 0` | LD+JSON flag |
| `has_dom_snippet` | `INTEGER` | `DEFAULT 0` | DOM-snippet flag |
| `crawled_at` | `TEXT` | `NOT NULL DEFAULT ''` | crawl timestamp |

### `source_screenshots`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `screenshot_id` | `TEXT` | `PRIMARY KEY` | screenshot identifier |
| `content_hash` | `TEXT` | `NOT NULL` | crawl-source hash |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `run_id` | `TEXT` | `NOT NULL` | run identifier |
| `source_url` | `TEXT` | `NOT NULL DEFAULT ''` | source URL |
| `host` | `TEXT` | `NOT NULL DEFAULT ''` | host |
| `selector` | `TEXT` | `NOT NULL DEFAULT 'fullpage'` | capture selector |
| `format` | `TEXT` | `NOT NULL DEFAULT 'jpg'` | image format |
| `width` | `INTEGER` | `DEFAULT 0` | width |
| `height` | `INTEGER` | `DEFAULT 0` | height |
| `size_bytes` | `INTEGER` | `DEFAULT 0` | file size |
| `file_path` | `TEXT` | `NOT NULL DEFAULT ''` | local file path |
| `captured_at` | `TEXT` | `NOT NULL DEFAULT ''` | capture timestamp |
| `doc_kind` | `TEXT` | `NOT NULL DEFAULT 'other'` | artifact kind |
| `source_tier` | `INTEGER` | `DEFAULT 5` | source tier |

### `source_videos`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `video_id` | `TEXT` | `PRIMARY KEY` | video identifier |
| `content_hash` | `TEXT` | `NOT NULL DEFAULT ''` | crawl-source hash |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `run_id` | `TEXT` | `NOT NULL` | run identifier |
| `source_url` | `TEXT` | `NOT NULL DEFAULT ''` | source URL |
| `host` | `TEXT` | `NOT NULL DEFAULT ''` | host |
| `worker_id` | `TEXT` | `NOT NULL DEFAULT ''` | worker identifier |
| `format` | `TEXT` | `NOT NULL DEFAULT 'webm'` | video format |
| `width` | `INTEGER` | `DEFAULT 0` | width |
| `height` | `INTEGER` | `DEFAULT 0` | height |
| `size_bytes` | `INTEGER` | `DEFAULT 0` | file size |
| `duration_ms` | `INTEGER` | `DEFAULT 0` | duration |
| `file_path` | `TEXT` | `NOT NULL DEFAULT ''` | local file path |
| `captured_at` | `TEXT` | `NOT NULL DEFAULT ''` | capture timestamp |

### `knob_snapshots`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `run_id` | `TEXT` |  | run identifier |
| `ts` | `TEXT` | `NOT NULL` | snapshot timestamp |
| `mismatch_count` | `INTEGER` | `NOT NULL DEFAULT 0` | mismatch count |
| `total_knobs` | `INTEGER` | `NOT NULL DEFAULT 0` | total knob count |
| `entries` | `TEXT` | `NOT NULL DEFAULT '[]'` | serialized snapshot entries |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `query_index`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `run_id` | `TEXT` |  | run identifier |
| `product_id` | `TEXT` |  | product identifier |
| `query` | `TEXT` |  | query text |
| `provider` | `TEXT` |  | provider |
| `result_count` | `INTEGER` | `NOT NULL DEFAULT 0` | result count |
| `field_yield` | `TEXT` |  | serialized field-yield summary |
| `tier` | `TEXT` | `DEFAULT NULL` | migration-added tier |
| `ts` | `TEXT` | `NOT NULL` | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `url_index`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `run_id` | `TEXT` |  | run identifier |
| `url` | `TEXT` |  | indexed URL |
| `host` | `TEXT` |  | host |
| `tier` | `TEXT` |  | source tier token |
| `doc_kind` | `TEXT` |  | document kind |
| `fields_filled` | `TEXT` |  | serialized field list |
| `fetch_success` | `INTEGER` | `NOT NULL DEFAULT 0` | success flag |
| `ts` | `TEXT` | `NOT NULL` | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `prompt_index`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | row id |
| `category` | `TEXT` | `NOT NULL` | category slug |
| `run_id` | `TEXT` |  | run identifier |
| `prompt_version` | `TEXT` |  | prompt version |
| `model` | `TEXT` |  | model id |
| `token_count` | `INTEGER` | `NOT NULL DEFAULT 0` | token count |
| `success` | `INTEGER` | `NOT NULL DEFAULT 1` | success flag |
| `ts` | `TEXT` | `NOT NULL` | timestamp |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | timestamp |

### `url_crawl_ledger`

Table constraints: composite primary key on (`canonical_url`, `product_id`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `canonical_url` | `TEXT` | `NOT NULL` | canonical URL |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | category slug |
| `original_url` | `TEXT` | `NOT NULL DEFAULT ''` | original URL |
| `domain` | `TEXT` | `NOT NULL DEFAULT ''` | domain |
| `path_sig` | `TEXT` | `NOT NULL DEFAULT ''` | normalized path signature |
| `final_url` | `TEXT` | `NOT NULL DEFAULT ''` | resolved final URL |
| `content_hash` | `TEXT` | `NOT NULL DEFAULT ''` | content-address hash |
| `content_type` | `TEXT` | `NOT NULL DEFAULT ''` | content type |
| `http_status` | `INTEGER` | `DEFAULT 0` | latest status |
| `bytes` | `INTEGER` | `DEFAULT 0` | size |
| `elapsed_ms` | `INTEGER` | `DEFAULT 0` | latency |
| `fetch_count` | `INTEGER` | `DEFAULT 1` | total fetches |
| `ok_count` | `INTEGER` | `DEFAULT 0` | success count |
| `blocked_count` | `INTEGER` | `DEFAULT 0` | blocked count |
| `timeout_count` | `INTEGER` | `DEFAULT 0` | timeout count |
| `server_error_count` | `INTEGER` | `DEFAULT 0` | 5xx count |
| `redirect_count` | `INTEGER` | `DEFAULT 0` | redirect count |
| `notfound_count` | `INTEGER` | `DEFAULT 0` | 404 count |
| `gone_count` | `INTEGER` | `DEFAULT 0` | 410 count |
| `first_seen_ts` | `TEXT` | `NOT NULL DEFAULT ''` | first-seen timestamp |
| `last_seen_ts` | `TEXT` | `NOT NULL DEFAULT ''` | last-seen timestamp |
| `first_seen_run_id` | `TEXT` | `NOT NULL DEFAULT ''` | first run id |
| `last_seen_run_id` | `TEXT` | `NOT NULL DEFAULT ''` | last run id |

### `query_cooldowns`

Table constraints: composite primary key on (`query_hash`, `product_id`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `query_hash` | `TEXT` | `NOT NULL` | query fingerprint |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | category slug |
| `query_text` | `TEXT` | `NOT NULL` | raw query text |
| `provider` | `TEXT` | `NOT NULL DEFAULT ''` | provider |
| `tier` | `TEXT` | `DEFAULT NULL` | tier token |
| `group_key` | `TEXT` | `DEFAULT NULL` | cooldown grouping key |
| `normalized_key` | `TEXT` | `DEFAULT NULL` | normalized query token |
| `hint_source` | `TEXT` | `DEFAULT NULL` | hint source |
| `attempt_count` | `INTEGER` | `DEFAULT 1` | attempts |
| `result_count` | `INTEGER` | `DEFAULT 0` | latest result count |
| `last_executed_at` | `TEXT` | `NOT NULL DEFAULT ''` | timestamp |
| `cooldown_until` | `TEXT` | `NOT NULL DEFAULT ''` | cooldown end timestamp |

### `field_studio_map`

`field_studio_map` is per-category because each SpecDb file is category-scoped, even though the table itself uses a fixed-row `id = 1`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY CHECK (id = 1)` | singleton row |
| `map_json` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized studio map |
| `map_hash` | `TEXT` | `NOT NULL DEFAULT ''` | content hash |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

### `field_key_order`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `PRIMARY KEY` | category slug |
| `order_json` | `TEXT` | `NOT NULL DEFAULT '[]'` | serialized field ordering |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | timestamp |

### `color_edition_finder`

Table constraints: composite primary key on (`category`, `product_id`).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `NOT NULL` | category slug |
| `product_id` | `TEXT` | `NOT NULL` | product identifier |
| `colors` | `TEXT` | `DEFAULT '[]'` | serialized colors array |
| `editions` | `TEXT` | `DEFAULT '[]'` | serialized editions array |
| `default_color` | `TEXT` | `DEFAULT ''` | selected default color |
| `cooldown_until` | `TEXT` | `DEFAULT ''` | cooldown end timestamp |
| `latest_ran_at` | `TEXT` | `DEFAULT ''` | last run timestamp |
| `run_count` | `INTEGER` | `DEFAULT 0` | run count |

## SpecDb: Ephemeral Cache Tables

### `field_audit_cache`

Table constraints: primary key on `category`. Lifecycle: rebuild=yes, source_edit=no. Ephemeral audit cache — delete DB, re-run audit via `POST /api/v1/test-mode/validate`, and it repopulates. Written directly by `src/app/api/routes/testModeRoutes.js`, not via a store module.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `PRIMARY KEY` | category slug |
| `total_fields` | `INTEGER` | `NOT NULL DEFAULT 0` | total audited fields |
| `total_checks` | `INTEGER` | `NOT NULL DEFAULT 0` | total validation checks |
| `pass_count` | `INTEGER` | `NOT NULL DEFAULT 0` | passing checks |
| `fail_count` | `INTEGER` | `NOT NULL DEFAULT 0` | failing checks |
| `result_json` | `TEXT` | `NOT NULL DEFAULT '{}'` | serialized per-field audit results |
| `run_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | audit run timestamp |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| schema | `src/db/appDbSchema.js` | AppDb tables and column constraints |
| source | `src/db/appDb.js` | AppDb runtime composition and seed-hash usage |
| schema | `src/db/specDbSchema.js` | base SpecDb tables, composite keys, and uniqueness rules |
| migration | `src/db/specDbMigrations.js` | live migration-added columns, renamed columns, and retired tables |
| source | `src/db/specDb.js` | SpecDb composition root and store wiring |
| source | `src/app/api/specDbRuntime.js` | lazy open, seed, and reconcile behavior |
| source | `src/app/api/services/specDbSyncService.js` | authority-to-SQLite sync path |
| source | `src/db/seed.js` | seed ordering and category import flow |
| source | `src/db/DOMAIN.md` | persistence-layer boundary contract |

## Related Documents

- [Backend Architecture](./backend-architecture.md) - Server boundaries that read and mutate these tables.
- [Environment and Config](../02-dependencies/environment-and-config.md) - Runtime settings surfaces backed partly by AppDb.
- [Feature Index](../04-features/feature-index.md) - Feature flows that traverse these entities.
- [Background Jobs](../06-references/background-jobs.md) - Long-running processes that populate run and telemetry tables.
