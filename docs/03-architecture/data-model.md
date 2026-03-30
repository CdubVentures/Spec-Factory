# Data Model

> **Purpose:** Document the verified SQLite schema, migration path, and canonical-versus-derived data ownership boundaries.
> **Prerequisites:** [backend-architecture.md](./backend-architecture.md), [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-24

## Persistence Summary

| Surface | Path | Role |
|--------|------|------|
| SQLite composition root | `src/db/specDb.js` | canonical read/write API used by the GUI server and feature code |
| DDL source of truth | `src/db/specDbSchema.js` | creates every table, index, and FTS surface |
| Idempotent migrations | `src/db/specDbMigrations.js` | adds later columns/indexes without re-creating the database |
| Seed + sync bridge | `src/db/seed.js`, `src/api/services/specDbSyncService.js` | projects category-authority artifacts into SQLite |
| Domain contract | `src/db/DOMAIN.md` | explains store ownership and composition boundaries |

## Canonical Vs Derived State

| Category | Canonical owner | Derived/read model surfaces |
|----------|-----------------|----------------------------|
| Category rules, labels, maps | `category_authority/{category}/_generated/*`, `category_authority/{category}/_control_plane/*`, `user-settings.json` | `sessionCache`, review layouts, runtime idx badges |
| Product catalog and brand registry | `category_authority/{category}/_control_plane/product_catalog.json`, brand registry helpers in `src/features/catalog/identity/brandRegistry.js` | `products`, `brands`, queue snapshots, review payload identity blocks |
| Accepted field/component/list values | `item_field_state`, `component_values`, `list_values` | review payloads, normalized output, learning reports |
| Queue state | `product_queue` plus file-backed queue helpers in `src/queue/queueState.js` | runtime dashboards, review queue, daemon selection |
| Billing and learning telemetry | `billing_entries`, `learning_profiles`, `category_brain`, `_billing/*`, `_learning/*` | Billing GUI, learning suggestions, reports |
| Runtime/evidence telemetry | `runtime_events`, `evidence_*`, `source_*`, `source_intel_*` | Runtime Ops, IndexLab analytics, evidence search |

## Migration Path

1. `src/db/specDbSchema.js` defines the base schema used on fresh database creation.
2. `src/db/specDbMigrations.js` applies additive `ALTER TABLE` statements and secondary indexes for existing databases.
3. `src/db/specDb.js` runs schema creation, migrations, statement preparation, and store wiring when `new SpecDb()` is constructed.
4. `src/api/services/specDbSyncService.js` and `src/db/seed.js` sync category-authority artifacts into the live SQLite state.

## Notes

- The schema comment at the bottom of `src/db/specDbSchema.js` explicitly states that the removed `source_strategy` table is no longer used; `sources.json` under category authority is the SSOT for source strategy.
- `evidence_chunks_fts` is the only verified virtual table in the schema; it indexes `evidence_chunks` text for evidence search.
- Several columns hold JSON-encoded text payloads (`meta`, `host_stats`, `per_field_helpfulness`, `last_run`, `data`, `fields`, `methods`) even though the underlying SQLite type is `TEXT`.
- Store modules are composited via `src/db/stores/`: candidateStore, reviewStore, componentStore, itemStateStore, enumListStore, keyReviewStore, billingStore, sourceIntelStore, queueProductStore, llmRouteSourceStore, and fieldHistoryStore.

## Core review state

### `candidates`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `candidate_id` | `TEXT` | `PRIMARY KEY` | Canonical candidate row id. |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `field_key` | `TEXT` | `NOT NULL` | Field under evaluation. |
| `value` | `TEXT` |  |  |
| `normalized_value` | `TEXT` |  |  |
| `score` | `REAL` | `DEFAULT 0` |  |
| `rank` | `INTEGER` |  |  |
| `source_url` | `TEXT` |  |  |
| `source_host` | `TEXT` |  |  |
| `source_root_domain` | `TEXT` |  |  |
| `source_tier` | `INTEGER` |  |  |
| `source_method` | `TEXT` |  |  |
| `approved_domain` | `INTEGER` | `DEFAULT 0` |  |
| `snippet_id` | `TEXT` |  | Deterministic snippet identifier from evidence extraction. |
| `snippet_hash` | `TEXT` |  |  |
| `snippet_text` | `TEXT` |  |  |
| `quote` | `TEXT` |  |  |
| `quote_span_start` | `INTEGER` |  |  |
| `quote_span_end` | `INTEGER` |  |  |
| `evidence_url` | `TEXT` |  |  |
| `evidence_retrieved_at` | `TEXT` |  |  |
| `is_component_field` | `INTEGER` | `DEFAULT 0` |  |
| `component_type` | `TEXT` |  |  |
| `is_list_field` | `INTEGER` | `DEFAULT 0` |  |
| `llm_extract_model` | `TEXT` |  |  |
| `extracted_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |  |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |

### `candidate_reviews`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `review_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `candidate_id` | `TEXT` | `NOT NULL REFERENCES candidates(candidate_id)` |  |
| `context_type` | `TEXT` | `NOT NULL CHECK(context_type IN ('item', 'component', 'list'))` |  |
| `context_id` | `TEXT` | `NOT NULL` |  |
| `human_accepted` | `INTEGER` | `DEFAULT 0` |  |
| `human_accepted_at` | `TEXT` |  |  |
| `ai_review_status` | `TEXT` | `DEFAULT 'not_run' CHECK(ai_review_status IN ('not_run', 'pending', 'accepted', 'rejected', 'unknown'))` |  |
| `ai_confidence` | `REAL` |  |  |
| `ai_reason` | `TEXT` |  |  |
| `ai_reviewed_at` | `TEXT` |  |  |
| `ai_review_model` | `TEXT` |  |  |
| `human_override_ai` | `INTEGER` | `DEFAULT 0` |  |
| `human_override_ai_at` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `item_field_state`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `value` | `TEXT` |  | Canonical accepted value for a product field. |
| `confidence` | `REAL` | `DEFAULT 0` |  |
| `source` | `TEXT` | `DEFAULT 'pipeline'` |  |
| `accepted_candidate_id` | `TEXT` |  |  |
| `overridden` | `INTEGER` | `DEFAULT 0` |  |
| `needs_ai_review` | `INTEGER` | `DEFAULT 0` |  |
| `ai_review_complete` | `INTEGER` | `DEFAULT 0` |  |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `item_component_links`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `component_type` | `TEXT` | `NOT NULL` |  |
| `component_name` | `TEXT` | `NOT NULL` |  |
| `component_maker` | `TEXT` | `DEFAULT ''` |  |
| `match_type` | `TEXT` |  |  |
| `match_score` | `REAL` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `item_list_links`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `list_value_id` | `INTEGER` | `REFERENCES list_values(id)` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

## Components and enums

### `component_values`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `component_type` | `TEXT` | `NOT NULL` |  |
| `component_name` | `TEXT` | `NOT NULL` |  |
| `component_maker` | `TEXT` | `DEFAULT ''` |  |
| `component_identity_id` | `INTEGER` | `REFERENCES component_identity(id)` |  |
| `property_key` | `TEXT` | `NOT NULL` |  |
| `value` | `TEXT` |  |  |
| `confidence` | `REAL` | `DEFAULT 1.0` |  |
| `variance_policy` | `TEXT` |  |  |
| `source` | `TEXT` | `DEFAULT 'component_db'` |  |
| `accepted_candidate_id` | `TEXT` |  |  |
| `needs_review` | `INTEGER` | `DEFAULT 0` |  |
| `overridden` | `INTEGER` | `DEFAULT 0` |  |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `component_identity`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `component_type` | `TEXT` | `NOT NULL` |  |
| `canonical_name` | `TEXT` | `NOT NULL` |  |
| `maker` | `TEXT` | `DEFAULT ''` |  |
| `links` | `TEXT` |  |  |
| `source` | `TEXT` | `DEFAULT 'component_db'` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `component_aliases`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `component_id` | `INTEGER` | `NOT NULL REFERENCES component_identity(id)` |  |
| `alias` | `TEXT` | `NOT NULL` |  |
| `source` | `TEXT` | `DEFAULT 'component_db'` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `enum_lists`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `source` | `TEXT` | `DEFAULT 'field_rules'` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `list_values`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `list_id` | `INTEGER` | `NOT NULL REFERENCES enum_lists(id)` |  |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `value` | `TEXT` | `NOT NULL` |  |
| `normalized_value` | `TEXT` |  |  |
| `source` | `TEXT` | `DEFAULT 'known_values'` |  |
| `accepted_candidate_id` | `TEXT` |  |  |
| `enum_policy` | `TEXT` |  |  |
| `needs_review` | `INTEGER` | `DEFAULT 0` |  |
| `overridden` | `INTEGER` | `DEFAULT 0` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `curation_suggestions`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `suggestion_id` | `TEXT` | `NOT NULL` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `suggestion_type` | `TEXT` | `NOT NULL` |  |
| `field_key` | `TEXT` |  |  |
| `component_type` | `TEXT` |  |  |
| `value` | `TEXT` | `NOT NULL` |  |
| `normalized_value` | `TEXT` |  |  |
| `status` | `TEXT` | `DEFAULT 'pending'` |  |
| `source` | `TEXT` |  |  |
| `product_id` | `TEXT` |  | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |
| `first_seen_at` | `TEXT` | `DEFAULT (datetime('now'))` |  |
| `last_seen_at` | `TEXT` |  |  |
| `reviewed_by` | `TEXT` |  |  |
| `reviewed_at` | `TEXT` |  |  |
| `review_note` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `component_review_queue`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `review_id` | `TEXT` | `NOT NULL` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `component_type` | `TEXT` | `NOT NULL` |  |
| `field_key` | `TEXT` |  |  |
| `raw_query` | `TEXT` |  |  |
| `matched_component` | `TEXT` |  |  |
| `match_type` | `TEXT` |  |  |
| `name_score` | `REAL` |  |  |
| `property_score` | `REAL` |  |  |
| `combined_score` | `REAL` |  |  |
| `alternatives` | `TEXT` |  |  |
| `product_id` | `TEXT` |  | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |
| `status` | `TEXT` | `DEFAULT 'pending_ai'` |  |
| `ai_decision` | `TEXT` |  |  |
| `ai_suggested_name` | `TEXT` |  |  |
| `ai_suggested_maker` | `TEXT` |  |  |
| `ai_reviewed_at` | `TEXT` |  |  |
| `product_attributes` | `TEXT` |  |  |
| `reasoning_note` | `TEXT` |  |  |
| `human_reviewed_at` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

## Catalog and queue

### `products`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `brand` | `TEXT` | `DEFAULT ''` |  |
| `model` | `TEXT` | `DEFAULT ''` |  |
| `variant` | `TEXT` | `DEFAULT ''` |  |
| `status` | `TEXT` | `DEFAULT 'active'` |  |
| `seed_urls` | `TEXT` |  |  |
| `identifier` | `TEXT` |  | Catalog identity lock / stable external identifier. |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `brands`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `brand_key` | `TEXT` | `NOT NULL` |  |
| `canonical_name` | `TEXT` | `NOT NULL` |  |
| `aliases` | `TEXT` |  |  |
| `categories` | `TEXT` |  |  |
| `website` | `TEXT` |  |  |
| `identifier` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `product_queue`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `s3key` | `TEXT` | `DEFAULT ''` |  |
| `status` | `TEXT` | `DEFAULT 'pending'` | Queue lifecycle state. |
| `priority` | `INTEGER` | `DEFAULT 3` |  |
| `attempts_total` | `INTEGER` | `DEFAULT 0` |  |
| `retry_count` | `INTEGER` | `DEFAULT 0` |  |
| `max_attempts` | `INTEGER` | `DEFAULT 3` |  |
| `next_retry_at` | `TEXT` |  |  |
| `last_run_id` | `TEXT` |  |  |
| `cost_usd_total` | `REAL` | `DEFAULT 0` |  |
| `rounds_completed` | `INTEGER` | `DEFAULT 0` |  |
| `next_action_hint` | `TEXT` |  |  |
| `last_urls_attempted` | `TEXT` |  |  |
| `last_error` | `TEXT` |  |  |
| `last_started_at` | `TEXT` |  |  |
| `last_completed_at` | `TEXT` |  |  |
| `dirty_flags` | `TEXT` |  |  |
| `last_summary` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `product_runs`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` | `NOT NULL` | IndexLab or pipeline run identifier. |
| `is_latest` | `INTEGER` | `DEFAULT 1` |  |
| `summary_json` | `TEXT` |  |  |
| `validated` | `INTEGER` | `DEFAULT 0` |  |
| `confidence` | `REAL` | `DEFAULT 0` |  |
| `cost_usd_run` | `REAL` | `DEFAULT 0` |  |
| `sources_attempted` | `INTEGER` | `DEFAULT 0` |  |
| `run_at` | `TEXT` | `DEFAULT (datetime('now'))` |  |

### `artifacts`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` |  | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |
| `artifact_type` | `TEXT` | `NOT NULL` |  |
| `url` | `TEXT` |  |  |
| `local_path` | `TEXT` |  |  |
| `content_hash` | `TEXT` |  |  |
| `mime_type` | `TEXT` |  |  |
| `size_bytes` | `INTEGER` |  |  |
| `fetched_at` | `TEXT` |  | Timestamp. |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `audit_log`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `event_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `category` | `TEXT` |  | Category slug. |
| `entity_type` | `TEXT` | `NOT NULL` |  |
| `entity_id` | `TEXT` | `NOT NULL` |  |
| `field_changed` | `TEXT` |  |  |
| `old_value` | `TEXT` |  |  |
| `new_value` | `TEXT` |  |  |
| `change_type` | `TEXT` | `DEFAULT 'update'` |  |
| `actor_type` | `TEXT` | `DEFAULT 'system'` |  |
| `actor_id` | `TEXT` |  |  |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |
| `note` | `TEXT` |  |  |
| `product_id` | `TEXT` |  | Product identifier used across catalog, queue, and review. |
| `component_type` | `TEXT` |  |  |
| `component_name` | `TEXT` |  |  |
| `field_key` | `TEXT` |  |  |

## LLM routing and source lineage

### `llm_route_matrix`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `scope` | `TEXT` | `NOT NULL CHECK(scope IN ('field', 'component', 'list'))` |  |
| `route_key` | `TEXT` | `NOT NULL` | Stable route/settings key per category. |
| `required_level` | `TEXT` | `NOT NULL` |  |
| `difficulty` | `TEXT` | `NOT NULL` |  |
| `availability` | `TEXT` | `NOT NULL` |  |
| `effort` | `INTEGER` | `NOT NULL DEFAULT 3` |  |
| `effort_band` | `TEXT` | `NOT NULL DEFAULT '1-3'` |  |
| `single_source_data` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `all_source_data` | `INTEGER` | `NOT NULL DEFAULT 0` |  |
| `enable_websearch` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `model_ladder_today` | `TEXT` | `NOT NULL` |  |
| `all_sources_confidence_repatch` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `max_tokens` | `INTEGER` | `NOT NULL DEFAULT 4096` |  |
| `studio_key_navigation_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_contract_rules_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_extraction_guidance_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_tooltip_or_description_sent_when_present` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_enum_options_sent_when_present` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_component_variance_constraints_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_parse_template_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_ai_mode_difficulty_effort_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_required_level_sent_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_component_entity_set_sent_when_component_field` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_evidence_policy_sent_direct_in_extract_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_variance_policy_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_constraints_sent_in_component_review` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `studio_send_booleans_prompted_to_model` | `INTEGER` | `NOT NULL DEFAULT 0` |  |
| `scalar_linked_send` | `TEXT` | `NOT NULL DEFAULT 'scalar value + prime sources'` |  |
| `component_values_send` | `TEXT` | `NOT NULL DEFAULT 'component values + prime sources'` |  |
| `list_values_send` | `TEXT` | `NOT NULL DEFAULT 'list values prime sources'` |  |
| `llm_output_min_evidence_refs_required` | `INTEGER` | `NOT NULL DEFAULT 1` |  |
| `insufficient_evidence_action` | `TEXT` | `NOT NULL DEFAULT 'threshold_unmet'` |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `source_registry`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `source_id` | `TEXT` | `PRIMARY KEY` | Canonical source record id. |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `item_identifier` | `TEXT` | `NOT NULL` |  |
| `product_id` | `TEXT` |  | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` |  | IndexLab or pipeline run identifier. |
| `source_url` | `TEXT` | `NOT NULL` |  |
| `source_host` | `TEXT` |  |  |
| `source_root_domain` | `TEXT` |  |  |
| `source_tier` | `INTEGER` |  |  |
| `source_method` | `TEXT` |  |  |
| `crawl_status` | `TEXT` | `DEFAULT 'fetched'` |  |
| `http_status` | `INTEGER` |  |  |
| `fetched_at` | `TEXT` |  | Timestamp. |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `source_artifacts`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `artifact_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `source_id` | `TEXT` | `NOT NULL REFERENCES source_registry(source_id)` |  |
| `artifact_type` | `TEXT` | `NOT NULL` |  |
| `local_path` | `TEXT` | `NOT NULL` |  |
| `content_hash` | `TEXT` |  |  |
| `mime_type` | `TEXT` |  |  |
| `size_bytes` | `INTEGER` |  |  |
| `captured_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `source_assertions`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `assertion_id` | `TEXT` | `PRIMARY KEY` | Canonical assertion row id. |
| `source_id` | `TEXT` | `NOT NULL REFERENCES source_registry(source_id)` |  |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `context_kind` | `TEXT` | `NOT NULL CHECK(context_kind IN ('scalar','component','list'))` |  |
| `context_ref` | `TEXT` |  |  |
| `item_field_state_id` | `INTEGER` | `REFERENCES item_field_state(id)` |  |
| `component_value_id` | `INTEGER` | `REFERENCES component_values(id)` |  |
| `list_value_id` | `INTEGER` | `REFERENCES list_values(id)` |  |
| `enum_list_id` | `INTEGER` | `REFERENCES enum_lists(id)` |  |
| `value_raw` | `TEXT` |  |  |
| `value_normalized` | `TEXT` |  |  |
| `unit` | `TEXT` |  |  |
| `candidate_id` | `TEXT` |  |  |
| `extraction_method` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `source_evidence_refs`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `evidence_ref_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `assertion_id` | `TEXT` | `NOT NULL REFERENCES source_assertions(assertion_id)` |  |
| `evidence_url` | `TEXT` |  |  |
| `snippet_id` | `TEXT` |  |  |
| `quote` | `TEXT` |  |  |
| `method` | `TEXT` |  |  |
| `tier` | `INTEGER` |  |  |
| `retrieved_at` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

## Key review workflow

### `key_review_state`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `target_kind` | `TEXT` | `NOT NULL CHECK(target_kind IN ('grid_key','enum_key','component_key'))` | grid_key, enum_key, or component_key. |
| `item_identifier` | `TEXT` |  |  |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `enum_value_norm` | `TEXT` |  |  |
| `component_identifier` | `TEXT` |  |  |
| `property_key` | `TEXT` |  |  |
| `item_field_state_id` | `INTEGER` | `REFERENCES item_field_state(id)` |  |
| `component_value_id` | `INTEGER` | `REFERENCES component_values(id)` |  |
| `component_identity_id` | `INTEGER` | `REFERENCES component_identity(id)` |  |
| `list_value_id` | `INTEGER` | `REFERENCES list_values(id)` |  |
| `enum_list_id` | `INTEGER` | `REFERENCES enum_lists(id)` |  |
| `required_level` | `TEXT` |  |  |
| `availability` | `TEXT` |  |  |
| `difficulty` | `TEXT` |  |  |
| `effort` | `INTEGER` |  |  |
| `ai_mode` | `TEXT` |  |  |
| `parse_template` | `TEXT` |  |  |
| `evidence_policy` | `TEXT` |  |  |
| `min_evidence_refs_effective` | `INTEGER` | `DEFAULT 1` |  |
| `min_distinct_sources_required` | `INTEGER` | `DEFAULT 1` |  |
| `send_mode` | `TEXT` | `CHECK(send_mode IN ('single_source_data','all_source_data'))` |  |
| `component_send_mode` | `TEXT` | `CHECK(component_send_mode IN ('component_values','component_values_prime_sources'))` |  |
| `list_send_mode` | `TEXT` | `CHECK(list_send_mode IN ('list_values','list_values_prime_sources'))` |  |
| `selected_value` | `TEXT` |  |  |
| `selected_candidate_id` | `TEXT` |  |  |
| `confidence_score` | `REAL` | `DEFAULT 0` |  |
| `confidence_level` | `TEXT` |  |  |
| `flagged_at` | `TEXT` |  |  |
| `resolved_at` | `TEXT` |  | Timestamp. |
| `ai_confirm_primary_status` | `TEXT` |  |  |
| `ai_confirm_primary_confidence` | `REAL` |  |  |
| `ai_confirm_primary_at` | `TEXT` |  |  |
| `ai_confirm_primary_interrupted` | `INTEGER` | `DEFAULT 0` |  |
| `ai_confirm_primary_error` | `TEXT` |  |  |
| `ai_confirm_shared_status` | `TEXT` |  |  |
| `ai_confirm_shared_confidence` | `REAL` |  |  |
| `ai_confirm_shared_at` | `TEXT` |  |  |
| `ai_confirm_shared_interrupted` | `INTEGER` | `DEFAULT 0` |  |
| `ai_confirm_shared_error` | `TEXT` |  |  |
| `user_accept_primary_status` | `TEXT` |  |  |
| `user_accept_primary_at` | `TEXT` |  |  |
| `user_accept_primary_by` | `TEXT` |  |  |
| `user_accept_shared_status` | `TEXT` |  |  |
| `user_accept_shared_at` | `TEXT` |  |  |
| `user_accept_shared_by` | `TEXT` |  |  |
| `user_override_ai_primary` | `INTEGER` | `DEFAULT 0` |  |
| `user_override_ai_primary_at` | `TEXT` |  |  |
| `user_override_ai_primary_reason` | `TEXT` |  |  |
| `user_override_ai_shared` | `INTEGER` | `DEFAULT 0` |  |
| `user_override_ai_shared_at` | `TEXT` |  |  |
| `user_override_ai_shared_reason` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `key_review_runs`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `run_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | IndexLab or pipeline run identifier. |
| `key_review_state_id` | `INTEGER` | `NOT NULL REFERENCES key_review_state(id)` |  |
| `stage` | `TEXT` | `NOT NULL` |  |
| `status` | `TEXT` | `NOT NULL` |  |
| `provider` | `TEXT` |  |  |
| `model_used` | `TEXT` |  |  |
| `prompt_hash` | `TEXT` |  |  |
| `response_schema_version` | `TEXT` |  |  |
| `input_tokens` | `INTEGER` |  |  |
| `output_tokens` | `INTEGER` |  |  |
| `latency_ms` | `INTEGER` |  |  |
| `cost_usd` | `REAL` |  |  |
| `error` | `TEXT` |  |  |
| `started_at` | `TEXT` |  |  |
| `finished_at` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `key_review_run_sources`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `key_review_run_id` | `INTEGER` | `NOT NULL REFERENCES key_review_runs(run_id)` |  |
| `assertion_id` | `TEXT` | `NOT NULL REFERENCES source_assertions(assertion_id)` |  |
| `packet_role` | `TEXT` |  |  |
| `position` | `INTEGER` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

### `key_review_audit`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `event_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `key_review_state_id` | `INTEGER` | `NOT NULL REFERENCES key_review_state(id)` |  |
| `event_type` | `TEXT` | `NOT NULL` |  |
| `actor_type` | `TEXT` | `NOT NULL` |  |
| `actor_id` | `TEXT` |  |  |
| `old_value` | `TEXT` |  |  |
| `new_value` | `TEXT` |  |  |
| `reason` | `TEXT` |  |  |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

## Billing, learning, and intel

### `billing_entries`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `ts` | `TEXT` | `NOT NULL` | Timestamp. |
| `month` | `TEXT` | `NOT NULL` |  |
| `day` | `TEXT` | `NOT NULL` |  |
| `provider` | `TEXT` | `NOT NULL DEFAULT 'unknown'` |  |
| `model` | `TEXT` | `NOT NULL DEFAULT 'unknown'` |  |
| `category` | `TEXT` | `DEFAULT ''` | Category slug. |
| `product_id` | `TEXT` | `DEFAULT ''` | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` | `DEFAULT ''` | IndexLab or pipeline run identifier. |
| `round` | `INTEGER` | `DEFAULT 0` |  |
| `prompt_tokens` | `INTEGER` | `DEFAULT 0` |  |
| `completion_tokens` | `INTEGER` | `DEFAULT 0` |  |
| `cached_prompt_tokens` | `INTEGER` | `DEFAULT 0` |  |
| `total_tokens` | `INTEGER` | `DEFAULT 0` |  |
| `cost_usd` | `REAL` | `DEFAULT 0` | Per-call or per-step cost. |
| `reason` | `TEXT` | `DEFAULT 'extract'` |  |
| `host` | `TEXT` | `DEFAULT ''` |  |
| `url_count` | `INTEGER` | `DEFAULT 0` |  |
| `evidence_chars` | `INTEGER` | `DEFAULT 0` |  |
| `estimated_usage` | `INTEGER` | `DEFAULT 0` |  |
| `meta` | `TEXT` | `DEFAULT '{}'` |  |

### `data_authority_sync`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `PRIMARY KEY` | Category slug. |
| `specdb_sync_version` | `INTEGER` | `NOT NULL DEFAULT 0` |  |
| `last_sync_status` | `TEXT` | `DEFAULT 'unknown'` |  |
| `last_sync_at` | `TEXT` |  |  |
| `last_sync_meta` | `TEXT` | `DEFAULT '{}'` |  |

### `llm_cache`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `cache_key` | `TEXT` | `PRIMARY KEY` |  |
| `response` | `TEXT` | `NOT NULL` |  |
| `timestamp` | `INTEGER` | `NOT NULL` |  |
| `ttl` | `INTEGER` | `NOT NULL` |  |

### `learning_profiles`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `profile_id` | `TEXT` | `PRIMARY KEY` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `brand` | `TEXT` | `DEFAULT ''` |  |
| `model` | `TEXT` | `DEFAULT ''` |  |
| `variant` | `TEXT` | `DEFAULT ''` |  |
| `runs_total` | `INTEGER` | `DEFAULT 0` |  |
| `validated_runs` | `INTEGER` | `DEFAULT 0` |  |
| `validated` | `INTEGER` | `DEFAULT 0` |  |
| `unknown_field_rate` | `REAL` | `DEFAULT 0` |  |
| `unknown_field_rate_avg` | `REAL` | `DEFAULT 0` |  |
| `parser_health_avg` | `REAL` | `DEFAULT 0` |  |
| `preferred_urls` | `TEXT` | `DEFAULT '[]'` |  |
| `feedback_urls` | `TEXT` | `DEFAULT '[]'` |  |
| `uncertain_fields` | `TEXT` | `DEFAULT '[]'` |  |
| `host_stats` | `TEXT` | `DEFAULT '[]'` |  |
| `critical_fields_below` | `TEXT` | `DEFAULT '[]'` |  |
| `last_run` | `TEXT` | `DEFAULT '{}'` |  |
| `parser_health` | `TEXT` | `DEFAULT '{}'` |  |
| `updated_at` | `TEXT` | `NOT NULL` | Timestamp. |

### `category_brain`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `artifact_name` | `TEXT` | `NOT NULL` |  |
| `payload` | `TEXT` | `NOT NULL` |  |
| `updated_at` | `TEXT` | `NOT NULL` | Timestamp. |

### `source_intel_domains`

Unified table for domain, brand, and path scope intelligence. Uses `scope` + `scope_key` discriminator.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `root_domain` | `TEXT` | `NOT NULL` | Part of composite PK. |
| `category` | `TEXT` | `NOT NULL` | Category slug. Part of composite PK. |
| `scope` | `TEXT` | `NOT NULL DEFAULT 'domain'` | `'domain'`, `'brand'`, or `'path'`. Part of composite PK. |
| `scope_key` | `TEXT` | `NOT NULL DEFAULT ''` | Empty for domain scope; brand_key or path for brand/path. Part of composite PK. |
| `brand` | `TEXT` | `DEFAULT ''` | Brand display name (brand scope only). |
| `attempts` | `INTEGER` | `DEFAULT 0` |  |
| `http_ok_count` | `INTEGER` | `DEFAULT 0` |  |
| `identity_match_count` | `INTEGER` | `DEFAULT 0` |  |
| `major_anchor_conflict_count` | `INTEGER` | `DEFAULT 0` |  |
| `fields_contributed_count` | `INTEGER` | `DEFAULT 0` |  |
| `fields_accepted_count` | `INTEGER` | `DEFAULT 0` |  |
| `accepted_critical_fields_count` | `INTEGER` | `DEFAULT 0` |  |
| `products_seen` | `INTEGER` | `DEFAULT 0` |  |
| `approved_attempts` | `INTEGER` | `DEFAULT 0` |  |
| `candidate_attempts` | `INTEGER` | `DEFAULT 0` |  |
| `parser_runs` | `INTEGER` | `DEFAULT 0` |  |
| `parser_success_count` | `INTEGER` | `DEFAULT 0` |  |
| `parser_health_score_total` | `REAL` | `DEFAULT 0` |  |
| `endpoint_signal_count` | `INTEGER` | `DEFAULT 0` |  |
| `endpoint_signal_score_total` | `REAL` | `DEFAULT 0` |  |
| `planner_score` | `REAL` | `DEFAULT 0` |  |
| `field_reward_strength` | `REAL` | `DEFAULT 0` |  |
| `recent_products` | `TEXT` | `DEFAULT '[]'` |  |
| `per_field_helpfulness` | `TEXT` | `DEFAULT '{}'` |  |
| `fingerprint_counts` | `TEXT` | `DEFAULT '{}'` |  |
| `extra_stats` | `TEXT` | `DEFAULT '{}'` |  |
| `last_seen_at` | `TEXT` |  |  |
| `updated_at` | `TEXT` |  | Timestamp. |

### `source_intel_field_rewards`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `root_domain` | `TEXT` | `NOT NULL` |  |
| `scope` | `TEXT` | `NOT NULL DEFAULT 'domain'` |  |
| `scope_key` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `field` | `TEXT` | `NOT NULL` |  |
| `method` | `TEXT` | `NOT NULL DEFAULT 'unknown'` |  |
| `seen_count` | `REAL` | `DEFAULT 0` |  |
| `success_count` | `REAL` | `DEFAULT 0` |  |
| `fail_count` | `REAL` | `DEFAULT 0` |  |
| `contradiction_count` | `REAL` | `DEFAULT 0` |  |
| `success_rate` | `REAL` | `DEFAULT 0` |  |
| `contradiction_rate` | `REAL` | `DEFAULT 0` |  |
| `reward_score` | `REAL` | `DEFAULT 0` |  |
| `last_seen_at` | `TEXT` |  |  |
| `last_decay_at` | `TEXT` |  |  |

### `source_corpus`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `url` | `TEXT` | `PRIMARY KEY` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `host` | `TEXT` | `DEFAULT ''` |  |
| `root_domain` | `TEXT` | `DEFAULT ''` |  |
| `path` | `TEXT` | `DEFAULT ''` |  |
| `title` | `TEXT` | `DEFAULT ''` |  |
| `snippet` | `TEXT` | `DEFAULT ''` |  |
| `tier` | `INTEGER` | `DEFAULT 99` |  |
| `role` | `TEXT` | `DEFAULT ''` |  |
| `fields` | `TEXT` | `DEFAULT '[]'` |  |
| `methods` | `TEXT` | `DEFAULT '[]'` |  |
| `identity_match` | `INTEGER` | `DEFAULT 0` |  |
| `approved_domain` | `INTEGER` | `DEFAULT 0` |  |
| `brand` | `TEXT` | `DEFAULT ''` |  |
| `model_name` | `TEXT` | `DEFAULT ''` |  |
| `variant` | `TEXT` | `DEFAULT ''` |  |
| `first_seen_at` | `TEXT` |  |  |
| `last_seen_at` | `TEXT` |  |  |

### `runtime_events`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `ts` | `TEXT` | `NOT NULL` | Timestamp. |
| `level` | `TEXT` | `DEFAULT 'info'` |  |
| `event` | `TEXT` | `NOT NULL` | Telemetry event name. |
| `category` | `TEXT` | `DEFAULT ''` | Category slug. |
| `product_id` | `TEXT` | `DEFAULT ''` | Product identifier used across catalog, queue, and review. |
| `run_id` | `TEXT` | `DEFAULT ''` | IndexLab or pipeline run identifier. |
| `data` | `TEXT` | `DEFAULT '{}'` |  |

## Evidence and discovery support

### `evidence_documents`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `doc_id` | `TEXT` | `PRIMARY KEY` |  |
| `content_hash` | `TEXT` | `NOT NULL` | Deduplication key with parser_version. |
| `parser_version` | `TEXT` | `NOT NULL` |  |
| `url` | `TEXT` | `NOT NULL` |  |
| `host` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `tier` | `INTEGER` | `DEFAULT 99` |  |
| `role` | `TEXT` | `DEFAULT ''` |  |
| `category` | `TEXT` | `NOT NULL DEFAULT ''` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL DEFAULT ''` | Product identifier used across catalog, queue, and review. |
| `dedupe_outcome` | `TEXT` | `NOT NULL DEFAULT 'new'` |  |
| `indexed_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | Timestamp. |

### `evidence_chunks`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `chunk_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `doc_id` | `TEXT` | `NOT NULL REFERENCES evidence_documents(doc_id)` |  |
| `snippet_id` | `TEXT` | `NOT NULL` | Stable snippet id inside evidence index. |
| `chunk_index` | `INTEGER` | `NOT NULL` |  |
| `chunk_type` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `text` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `normalized_text` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `snippet_hash` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `extraction_method` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `field_hints` | `TEXT` | `NOT NULL DEFAULT '[]'` |  |

### `evidence_facts`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `fact_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `chunk_id` | `INTEGER` | `NOT NULL REFERENCES evidence_chunks(chunk_id)` |  |
| `doc_id` | `TEXT` | `NOT NULL REFERENCES evidence_documents(doc_id)` |  |
| `field_key` | `TEXT` | `NOT NULL` |  |
| `value_raw` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `value_normalized` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `unit` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `extraction_method` | `TEXT` | `NOT NULL DEFAULT ''` |  |
| `confidence` | `REAL` | `NOT NULL DEFAULT 0` |  |

### `brand_domains`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `brand` | `TEXT` | `NOT NULL` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `official_domain` | `TEXT` |  | Brand resolver output. |
| `aliases` | `TEXT` |  |  |
| `support_domain` | `TEXT` |  |  |
| `confidence` | `REAL` | `DEFAULT 0.8` |  |
| `resolved_at` | `TEXT` | `DEFAULT (datetime('now'))` | Timestamp. |

## Field history (learning persistence)

### `field_history`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |  |
| `category` | `TEXT` | `NOT NULL` | Category slug. |
| `product_id` | `TEXT` | `NOT NULL` | Product identifier. |
| `field_key` | `TEXT` | `NOT NULL` | Field under tracking. |
| `round` | `INTEGER` | `NOT NULL` | Pipeline round number. |
| `run_id` | `TEXT` | `NOT NULL` | IndexLab run identifier. |
| `history_json` | `TEXT` | `NOT NULL DEFAULT '{}'` | JSON-encoded field history payload. |
| `created_at` | `TEXT` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Timestamp. |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Timestamp. |

Unique constraint: `(category, product_id, field_key)`. Index: `idx_fh_product ON field_history(category, product_id)`.

Store module: `src/db/stores/fieldHistoryStore.js`. Wired into SpecDb class. Portable SQL for PostgreSQL migration path.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| schema | `src/db/specDbSchema.js` | Full table, column, index, and FTS definitions |
| migration | `src/db/specDbMigrations.js` | Additive migration columns and secondary indexes |
| source | `src/db/specDb.js` | Runtime schema bootstrap and store composition |
| source | `src/db/DOMAIN.md` | Store ownership and database boundary contract |
| source | `src/api/services/specDbSyncService.js` | Authority-to-SQLite synchronization path |

## Related Documents

- [Backend Architecture](./backend-architecture.md) - Shows which server boundaries read and mutate these tables.
- [Auth and Sessions](./auth-and-sessions.md) - Explains the absence of a true auth/session persistence layer.
- [Catalog and Product Selection](../04-features/catalog-and-product-selection.md) - Follows the catalog and queue tables through a user-facing flow.
