# AppDb / SpecDb Boundary Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — `studio_maps` table in AppDb appears orphaned (now lives in SpecDb's `field_studio_map`); `brand_categories` rebuild is implicit and breaks if AppDb is rebuilt without products.

## Boundary model

- **AppDb** (`.workspace/db/app.sqlite`) — singleton, opened at bootstrap; global cross-category state.
- **SpecDb** (`.workspace/db/{category}/spec.sqlite`) — per-category, lazy-loaded via `getSpecDb(category)`.
- Global finder settings live in AppDb but are accessed by SpecDb code via a shared `globalDb` reference (`specDb.js` constructor).

## AppDb tables (global)

| Table | Purpose | Rebuild source |
|---|---|---|
| `brands` | Brand master | `category_authority/_global/brand_registry.json` |
| `brand_categories` | Brand × category m:n | derived from products in each SpecDb (implicit) |
| `brand_renames` | Audit trail | brand_registry.json |
| `settings` | KV config (user settings + `_seed_hashes`) | `.workspace/global/user-settings.json` |
| `studio_maps` | Legacy field-studio-map table | **none — likely orphan** |
| `color_registry` | UI colour tokens | `category_authority/_global/color_registry.json` |
| `unit_registry` | Physical units | `category_authority/_global/unit_registry.json` |
| `finder_global_settings` | Per-finder settings (shared across categories) | `category_authority/_global/{module}_settings.json` |
| `billing_entries` | LLM cost ledger | `.workspace/global/billing/ledger/*.jsonl` |

## SpecDb tables (per-category)

| Group | Tables |
|---|---|
| Components / enums | `component_identity`, `component_values`, `component_aliases`, `enum_lists`, `list_values`, `item_component_links`, `item_list_links` |
| Field state | `field_candidates`, `field_candidate_evidence`, `field_studio_map`, `field_key_order` |
| Products / variants | `products`, `variants` |
| Finder outputs (summary + runs) | `color_edition_finder*`, `product_image_finder*`, `release_date_finder*`, `sku_finder*`, `key_finder*`, `pif_variant_progress` |
| Run lifecycle | `runs`, `run_artifacts`, `bridge_events`, `crawl_sources`, `source_screenshots`, `source_videos`, `url_crawl_ledger`, `query_cooldowns` |
| Telemetry | `knob_snapshots`, `query_index`, `url_index`, `prompt_index` |
| Authority | `data_authority_sync`, `source_strategy_meta`, `source_strategy_entries`, `spec_seed_sets`, `spec_seed_templates` |
| Audit | `field_audit_cache` |

All "rebuild yes" per the seed registry phases in `specDbRuntime.js`.

## Identified gaps

### G1. `studio_maps` in AppDb appears orphaned — MEDIUM
**Files:** `src/db/appDb.js` (`upsertStudioMap`, `getStudioMap`), vs `src/db/specDb.js` (`upsertFieldStudioMap`, `getFieldStudioMap`).
- Real field-studio-map writes go to SpecDb (`field_studio_map` table).
- AppDb `studio_maps` has no reseed source and no observed read on the request hot-path.
- If anything still writes via `appDb.upsertStudioMap()`, it can drift from the authoritative SpecDb copy silently.

**Fix shape:** grep for `getStudioMap(` and `upsertStudioMap(` callers. If unused: delete the table + routes (Subtractive Engineering Mandate). If used: wire through SpecDb instead and retire AppDb copy.

### G2. `brand_categories` rebuild is implicit — MEDIUM
On AppDb fresh-start, `brand_categories` starts empty. Rows are populated lazily as products surface in each SpecDb. If you delete `app.sqlite` but keep the SpecDbs, the m:n table is wrong until something repopulates it.

**Fix shape:** add an explicit reseed phase: on first `getAppDb()` after rebuild, scan every SpecDb's `products` table and reconstruct `brand_categories`.

### G3. No explicit `categories` table — LOW
The canonical category list is implicit (filesystem `category_authority/{cat}/` directories + presence of `{cat}/spec.sqlite`). No DB row enumerates them.

**Fix shape:** add a `categories` table in AppDb seeded from the filesystem at bootstrap; gives a queryable inventory + audit point.

### G4. `settings` table is an undocumented grab-bag — LOW
Sections include `_seed_hashes`, `runtime_settings`, plus arbitrary keys. No formal section schema.

**Fix shape:** add a header comment in `appDbSchema.js` listing reserved sections + their purpose.

### G5. No explicit cross-DB FK guard — LOW
SpecDb's `products.brand_identifier` references AppDb's `brands.slug` but is not a SQL foreign key (different DB files). A brand rename in AppDb could orphan SpecDb rows.

**Fix shape:** when AppDb rename occurs, fan-out to all SpecDbs to update the field. Or document the contract: "renames always go through `appDb.brand_renames` + cascade".

### G6. Migrations on two tracks — INFO
`appDbMigrations.js` (1 migration so far) and `specDbMigrations.js` (20+). Separate migration runners. Acceptable today but document the contract: a migration that touches both must update both runners.

## Rebuild contract scenarios

| Scenario | Recovery | Data loss |
|---|---|---|
| Delete `app.sqlite` only | bootstrap reseeds finder_global_settings, brands, billing, colors, units; `brand_categories` empty until G2 fix | None (with G2) |
| Delete `{cat}/spec.sqlite` only | `getSpecDb(cat)` triggers all reseed phases | None |
| Delete both | sequential reseed | None |
| Delete `.workspace/` entirely | impossible without external backup | total |

## Confirmed-good patterns

- Clear separation of concern: global state lives in AppDb, category state in SpecDb.
- `globalDb` reference threading lets SpecDb code read shared finder settings without duplication.
- Every SpecDb table has a documented reseed source and a phase in the registry.
- Single-writer pattern for `field_candidates`: candidates go through `submitCandidate` → SQL + JSON mirror.
- Billing is intentionally global (one user-visible cost dashboard) rather than per-category.

## Recommended fix order

1. **G1** — investigate `studio_maps` callers; remove or rewire. Highest drift surface.
2. **G2** — explicit `brand_categories` rebuild on AppDb fresh-start.
3. **G5** — define rename cascade contract or wire it.
4. **G3** — `categories` table for audit inventory.
5. **G4** — document `settings` sections.
6. **G6** — migration cross-track note.
