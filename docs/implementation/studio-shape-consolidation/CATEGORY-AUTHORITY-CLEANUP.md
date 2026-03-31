# Category Authority Cleanup — Audit & Phased Remediation Plan

> Generated 2026-03-29. Follows the Studio Shape Consolidation (Phases 1-5 complete).
> This document covers the broader category_authority/ filesystem cleanup: dead file removal, redundancy elimination, cross-boundary violations, and the path toward feature-first ownership.

---

## 1. Current State (post-shape-consolidation)

### What was already done (Phases 1-5)

| Change | Files |
|--------|-------|
| Zod SSOT schemas for all studio API shapes | `src/features/studio/contracts/studioSchemas.js` (13 schemas + 6 key arrays) |
| Route validation via schema.parse() | `src/features/studio/api/studioRoutes.js` (8 return points) |
| Codegen: backend Zod → frontend TS interfaces | `scripts/generate-studio-types.js` → `tools/gui-react/src/types/studio.ts` |
| Dead code deleted | `studioShapes.js` (zero importers), 3 draft files (mouse), `_versions/` dirs (all 3 categories) |
| Version snapshots stopped | `writeControlPlaneSnapshot()` is now a no-op |
| Golden-master contract tests | `studioShapeGoldenMaster.test.js` (7 tests) |
| O(1 verified | Adding a field to StudioPayloadSchema propagates to key array + generated TS from 1 file edit |

### Compilation proof (2026-03-29)

All 3 categories compiled with 0 errors. 27/27 substantive generated files are byte-identical to the reference copy. SQL seeding produces correct row counts. Route responses pass schema.parse() with live seeded data.

---

## 2. category_authority/ File Hierarchy (current, post-cleanup)

```
category_authority/{category}/
├── sources.json                              ACTIVE — source registry (URLs, tiers, crawl config)
│                                              Written by: indexing (POST/PUT/DELETE /source-strategy)
│                                              Read by: categories/loader, indexing pipeline, seeder
│
├── _control_plane/
│   ├── field_studio_map.json                 ACTIVE — curator's workbook mapping (THE INPUT)
│   │                                          Written by: ingest (compile), studio (save map)
│   │                                          Read by: studio routes, field-rules compiler, review, seeder
│   │
│   ├── field_rules.full.json                 ACTIVE — compiled full output with source context
│   │                                          Written by: ingest (compile only)
│   │                                          Read by: compile context loader, contract tests
│   │
│   └── product_catalog.json                  READ-ONLY BOOT SEED — product identity registry
│                                              Written by: never (static seed file)
│                                              Read by: seed.js at boot (populates empty SQL)
│                                              SSOT: SQL products table + .workspace/products/{pid}/product.json
│
├── _generated/                               COMPILE-ONLY OUTPUT (deterministic from field_studio_map)
│   ├── field_rules.json                      ACTIVE — compiled rules (seeds SQL, 40+ readers)
│   ├── field_rules.runtime.json              DELETED (Phase A) — was byte-identical to field_rules.json
│   ├── ui_field_catalog.json                 ACTIVE — UI field metadata
│   ├── known_values.json                     ACTIVE — enum values per field
│   ├── parse_templates.json                  ACTIVE — read by loader.js → engine (getParseTemplate)
│   ├── cross_validation_rules.json           ACTIVE — read by loader.js → engine (crossValidate)
│   ├── field_groups.json                     ACTIVE — field groupings for UI
│   ├── key_migrations.json                   SEMI-ACTIVE — only if field renames exist
│   ├── manifest.json                         ACTIVE — read by sessionCache.js for compiledAt
│   ├── _compile_report.json                  ACTIVE — compile diagnostics
│   └── component_db/                         ACTIVE — component identity databases
│       ├── sensors.json
│       ├── switches.json
│       └── ...
│
├── _overrides/                               CURATOR CORRECTIONS (active, not bloat)
│   ├── components/                           Written by: review + pipeline batch
│   │   └── {type}_{slug}.json                Component property fixes
│   └── {productId}.overrides.json            Written by: review (field approval)
│                                              Also touched by: catalog (artifact migration)
│
├── _suggestions/                             AI/PIPELINE DISCOVERIES (pending review)
│   ├── enums.json                            ACTIVE — Written by: studio + review + ingest (3 owners!)
│   ├── components.json                       ACTIVE — Written by: review + engine
│   ├── component_review.json                 ACTIVE — Written by: pipeline batch
│   ├── constraints.json                      DELETED (Phase A) — was empty placeholder, zero readers
│   └── lexicon.json                          DELETED (Phase A) — was empty placeholder, zero readers
│
├── _source/                                  (keyboard/monitor only)
│   └── field_catalog.seed.json               ACTIVE — seed data for field catalog
│
├── tests/                                    Category-specific contract tests
│
└── (keyboard/monitor root files)
    ├── schema.json                           ACTIVE — core category metadata
    ├── required_fields.json                  ACTIVE — field availability constraints
    ├── anchors.json                          ACTIVE — anchor field definitions
    └── search_templates.json                 ACTIVE — search query templates
```

---

## 3. Dead & Redundant Files

### Confirmed dead (zero runtime readers) — CORRECTED after Phase A audit

| File | Per category | Status | Evidence |
|------|-------------|--------|---------|
| `_generated/field_rules.runtime.json` | all 3 | **DELETED (Phase A)** | Byte-identical to field_rules.json. All readers have field_rules.json as primary. |
| `_generated/parse_templates.json` | all 3 | **ACTIVE (corrected)** | Read by `loader.js:399` → `fieldRulesEngine.js:65,186` for extraction templates |
| `_generated/cross_validation_rules.json` | all 3 | **ACTIVE (corrected)** | Read by `loader.js:400` → `fieldRulesEngine.js:66,589` for cross-field validation |
| `_generated/manifest.json` | all 3 | **ACTIVE (corrected)** | Read by `sessionCache.js:132` for `compiledAt` → drives `compileStale` indicator |
| `_suggestions/constraints.json` | all 3 | **DELETED (Phase A)** | Empty placeholder, zero runtime readers |
| `_suggestions/lexicon.json` | all 3 | **DELETED (Phase A)** | Empty placeholder, zero runtime readers |

**Phase A deleted 9 files (3 types x 3 categories). 3 originally-labeled-dead files were proven ACTIVE.**

### Already deleted

| File | When | Why |
|------|------|-----|
| `_control_plane/draft.json` | Phase 5 (2026-03-29) | Dead — zero readers (mouse only) |
| `_control_plane/field_rules_draft.json` | Phase 5 (2026-03-29) | Dead — zero readers (mouse only) |
| `_control_plane/ui_field_catalog_draft.json` | Phase 5 (2026-03-29) | Dead — zero readers (mouse only) |
| `_control_plane/_versions/` | Phase 5 (2026-03-29) | Write-only archive with no rollback mechanism |
| `monitor/activeFiltering.json` | Phase 5 (2026-03-29) | Dead — never read or written |
| `src/features/studio/contracts/studioShapes.js` | Phase 3 (2026-03-29) | Dead — zero importers |

---

## 4. Cross-Boundary Violations

CLAUDE.md says: "Features must not import other features' internals. Use explicit public contracts."

### Who writes what (the violation map)

| File | Writers | Violation |
|------|---------|-----------|
| `_suggestions/enums.json` | studio, review, ingest | **3 features write to same file — no single owner** |
| `_control_plane/field_studio_map.json` | ingest, studio | **2 features write — unclear ownership** |
| `_overrides/*.overrides.json` | review, catalog | **2 features write — catalog migrates, review creates** |
| `_generated/*` | ingest writes, 4 features read | **No public contract — readers assume internal structure** |

### Who reads _generated/ (no contract, just raw path.join)

- `src/features/studio/api/studioRoutes.js` — reads known_values.json, _suggestions/enums.json
- `src/features/review/domain/reviewGridData.js` — reads field_studio_map.json
- `src/engine/` — reads field_rules.json via session cache
- `src/db/seed.js` — reads field_rules.json, component_db/*.json, _overrides/, _suggestions/
- `src/categories/loader.js` — reads field_rules.json, ui_field_catalog.json, field_groups.json, etc.

All construct paths directly with `path.join(HELPER_ROOT, category, '_generated/field_rules.json')`. No facade, no public API.

---

## 5. Phased Remediation Plan

### Phase A: Delete dead files + stop creating them — COMPLETE (2026-03-29)

**Scope (corrected)**: Delete 3 truly dead file types (9 files) from all 3 categories. Original plan targeted 6 types (18 files), but deep grep audit proved parse_templates, cross_validation_rules, and manifest are ACTIVE.

**Files deleted from disk (9 files across 3 categories):**
- `_generated/field_rules.runtime.json` (all 3) — byte-identical fallback
- `_suggestions/constraints.json` (all 3) — empty placeholder, zero readers
- `_suggestions/lexicon.json` (all 3) — empty placeholder, zero readers

**Files NOT deleted (corrected from original plan):**
- `_generated/parse_templates.json` — ACTIVE: `loader.js:399` → `fieldRulesEngine.js:65,186`
- `_generated/cross_validation_rules.json` — ACTIVE: `loader.js:400` → `fieldRulesEngine.js:66,589`
- `_generated/manifest.json` — ACTIVE: `sessionCache.js:132` → `compiledAt` → `compileStale`

**Code changes (10 production files + 6 test files + 1 README):**
- `src/ingest/compileFileIo.js` — simplified `writeCanonicalFieldRulesPair()` to write only field_rules.json
- `src/ingest/compileOutputWriter.js` — removed identical check + lexicon/constraints from suggestion defaults
- `src/ingest/compileAssembler.js` — removed field_rules_runtime from compile report
- `src/ingest/catalogSeed.js` — removed runtime.json from path candidates
- `src/categories/loader.js` — removed runtime.json fallback
- `src/field-rules/compiler.js` — removed runtime variable + conditional write
- `src/features/indexing/api/builders/runtimeOpsFieldRuleGateHelpers.js` — field_rules.json only
- `src/features/indexing/api/builders/processStartLaunchPlan.js` — field_rules.json only
- `src/app/api/routes/testModeRoutes.js` — removed runtime.json from copy list
- `src/ingest/README.md` — updated canonical pair invariant

**Verification passed:**
- All test suites green (field-rules 81/81, ingest 7/7, categories 7/7, engine 165/165, studio 21/21, db 139/139, indexing builders 40/40, process start 10/10+3/3)
- 9 dead files confirmed absent after compilation
- 7 active files confirmed present
- Frontend tsc clean

---

### Phase B: Consolidate root category files into schema.json (keyboard/monitor)

**Scope**: Merge `required_fields.json`, `anchors.json`, `search_templates.json` into `schema.json` as nested keys. Update `loader.js` to read from consolidated file.

**Files to consolidate:**
- `required_fields.json` → `schema.required_fields`
- `anchors.json` → `schema.anchor_fields`
- `search_templates.json` → `schema.search_templates`

**Code changes:**
- `src/categories/loader.js` — read consolidated keys from schema.json
- `src/field-rules/compilerCategoryInit.js` — create consolidated schema on bootstrap
- Delete the 3 standalone files per category (6 files total)

**Verification:**
- Category loader returns identical config
- Pipeline runs produce identical outputs
- GUI: open Pipeline Settings, verify sources and search templates load

---

### Phase C: Investigate field_rules.full.json redundancy

**Scope**: Determine if `field_rules.full.json` can be eliminated in favor of `field_rules.json`. The `.full` version adds `source_context`, `enum_buckets`, `parse_templates` inline; the generated version splits these into separate files.

**Investigation needed:**
- Do any readers of `field_rules.full.json` actually use the extra inline data?
- Can `compileContextLoader.js` (the only reader beyond tests) use `field_rules.json` instead?
- If yes, delete `.full` and stop generating it

---

### Phase D: Establish category authority ownership boundaries — COMPLETE (2026-03-29)

**Scope**: Lightweight path-helper facades + barrel exports clarifying which feature owns which subdirectory. No file moves — only source code changes.

**Ownership map (verified via grep audit of all writers + readers):**

| File/Directory | Owner (writer) | Barrel export | Cross-boundary readers |
|---------------|---------------|---------------|----------------------|
| `_control_plane/field_studio_map.json` | `src/ingest/` | `loadFieldStudioMap()`, `saveFieldStudioMap()` | studio, field-rules/sessionCache |
| `_control_plane/product_catalog.json` | read-only (static boot seed) | `loadProductCatalog()` | db/seed (boot only). SSOT: SQL `products` table |
| `_generated/*` (all compile output) | `src/ingest/` + `src/field-rules/` | `resolveGeneratedRoot()` | categories/loader, field-rules/loader, engine, studio, review, db/seed |
| `_overrides/*.overrides.json` | `src/features/review/` | `resolveOverrideFilePath()` | field-rules/loader, ingest, db/seed, publish |
| `_overrides/components/*.json` | `src/features/review/` | (via review barrel) | field-rules/loader |
| `_suggestions/enums.json` | **4 writers** (ingest, studio, review, engine) | `suggestionFilePath()`, `appendReviewSuggestion()` | ingest/compile, studio, engine, db/seed |
| `_suggestions/components.json` | **3 writers** (ingest, review, engine) | same as enums | engine, ingest |
| `_suggestions/component_review.json` | `src/engine/` | (engine-internal) | engine |
| `_suggestions/component_identity.json` | `src/engine/` | (engine-internal) | engine |
| `sources.json` | `src/features/indexing/` | `readSourcesFile()`, `writeSourcesFile()` | categories/loader, db, publish |
| `schema.json` | `src/field-rules/` (init) | (read via categories/loader) | categories, ingest, expansion-hardening |

**Code changes:**
- Created `src/ingest/compilePaths.js` — centralized path resolution helpers (resolveHelperRoot, resolveCategoryRoot, resolveGeneratedRoot, resolveControlPlaneRoot, resolveSuggestionsRoot, resolveOverridesRoot)
- Updated `src/ingest/index.js` — exports all path helpers
- Updated `src/features/indexing/index.js` — exports `readSourcesFile`, `writeSourcesFile`
- Catalog and review barrels already export their read/write functions

**Cross-boundary violations remaining (to be resolved in Phase E via SQL migration):**
- `_suggestions/enums.json` — 4 concurrent writers (worst violation)
- `_suggestions/components.json` — 3 concurrent writers
- Direct `path.join()` calls in ~15 files could gradually migrate to use path helpers

---

### Phase E: Move mutable state to SQL

**Scope**: CLAUDE.md says "No local file databases for mutable state." The `_suggestions/` and `_overrides/` files are mutable runtime state sitting inside `category_authority/` — which violates feature-first ownership (review data in the compile pipeline's directory).

**E1 — COMPLETE (2026-03-29)**: All 8+ writers now dual-write to SQL + file. Added SQL dual-write to `appendReviewSuggestion()`, `applyEnumConsistencyToSuggestions()`, `approveGreenOverrides()`. CLI callers pass `specDb`.

**E2 — PLANNED**: Migrate readers from file to SQL. After E2, files become read-only archive.

**E3 — REVISED**: Do NOT delete `_overrides/` files. These contain **human-curated review decisions** (field approvals, manual corrections). If the SQL database needs rebuilding, the JSON files are the disaster recovery source. E3 should:
- Stop writing to files (remove dual-write, SQL becomes sole writer)
- Keep existing `_overrides/` files as **read-only archive** until SQL has its own export/backup mechanism
- `_suggestions/` files are lower risk (pending items, not approved decisions) but should also be archived, not deleted
- Add `export-overrides` CLI command to dump SQL → JSON before any file deletion

**Architectural note**: `_overrides/` and `_suggestions/` are review-feature data that ended up in `category_authority/` for compile-pipeline convenience. The correct long-term home is SQL (via review feature's SpecDb store layer), not a filesystem subdirectory inside the compile domain.

---

## 6. Verification Protocol (required after EVERY phase)

After each phase, run this full verification:

```bash
# 1. Compile all categories
node src/cli/spec.js compile-rules --all --local

# 2. Backend test suite
node --test src/features/studio/api/tests/*.test.js
node --test src/ingest/tests/*.test.js

# 3. SQL seed verification
node -e "
import { SpecDb } from './src/db/specDb.js';
import { seedSpecDb } from './src/db/seed.js';
import fs from 'node:fs';
import path from 'node:path';
const root = 'category_authority';
for (const cat of ['mouse', 'keyboard', 'monitor']) {
  const db = new SpecDb({ category: cat, dbPath: ':memory:' });
  const fr = JSON.parse(fs.readFileSync(path.join(root, cat, '_generated', 'field_rules.json'), 'utf8'));
  await seedSpecDb({ db, config: { categoryAuthorityRoot: root }, category: cat, fieldRules: fr, logger: null });
  const lv = db.db.prepare('SELECT COUNT(*) as n FROM list_values').get().n;
  const p = db.db.prepare('SELECT COUNT(*) as n FROM products').get().n;
  console.log(cat + ': list_values=' + lv + ' products=' + p);
  db.close();
}
"

# 4. Frontend type check
cd tools/gui-react && npx tsc --noEmit

# 5. GUI smoke test (manual)
# - Open Studio page → verify payload loads
# - Open Review page → verify grid loads
# - Open Pipeline Settings → verify sources load
# - Click Compile → verify it completes
```

---

## 7. File count targets

| Metric | Before cleanup | After Phase A (actual) | After Phase B | After Phase C |
|--------|---------------|----------------------|---------------|---------------|
| Files per category (mouse) | ~50 | ~47 (-3 dead) | ~47 (mouse has no root files) | ~46 (-1 full) |
| Files per category (keyboard) | ~23 | ~20 (-3 dead) | ~17 (-3 consolidated) | ~16 |
| Files per category (monitor) | ~24 | ~21 (-3 dead) | ~18 (-3 consolidated) | ~17 |
| Total dead files | 9 | 0 | 0 | 0 |
| Cross-boundary violations | 4 major | 4 (unchanged) | 4 (unchanged) | Fixed in Phase D |
