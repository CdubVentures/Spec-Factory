# Variant SSOT Roadmap

> Promote `variant_registry` from a JSON blob on the CEF summary table to a
> first-class SQL entity that acts as the Single Source of Truth for all
> variant-dependent features.

## Date/Time Display — Always Route Through The Central Time Module

Every date and time rendered in this feature must flow through
`tools/gui-react/src/utils/dateTime.ts`. The user picks timezone
(default **PST**) and date format (default **MM-DD-YY**) in the top-right
Appearance panel, and every panel must honor those settings. Storage stays
UTC — only the display layer converts.

| Context | Use |
| --- | --- |
| Reactive page component (single call site) | `useFormatDate()` / `useFormatTime()` / `useFormatDateTime()` |
| Hot or shared component (table cells, tooltips, run rows) | `pullFormatDate` / `pullFormatTime` / `pullFormatDateTime` |
| Field-cell value carrying a date (e.g. `release_date`) | `formatCellValue` from `utils/fieldNormalize.ts` (or `maybeFormatDateValue` when the value is known to be a date) |
| Elapsed / relative timer (compares against `Date.now()`) | `parseBackendMs(iso)` then guard with `Number.isFinite` |
| Column header showing the active zone label | `useTimezoneLabel()` |
| Non-React context (sort / filter / comparator) | Pure `formatDate` / `formatTime` / `formatDateTime` with explicit args |

**Never:** `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` on
dates; `new Date(iso).getTime()` or `Date.parse(iso)` when comparing to
`Date.now()` (SQLite emits TZ-less UTC — must use `parseBackendMs`);
hardcoded `America/Los_Angeles` or `timeZone:` literals; 24-hour clocks
(`hour12: false`, `useFormatTime(false)`, `useFormatDateTime(false)`);
`.split('T')[0]` / `.slice(0, 10)` to strip to YMD; one-off formatter
helpers colocated with components.

**Adding a new timezone or date format option:** extend
`SF_TIMEZONE_OPTIONS` / `SF_DATE_FORMAT_OPTIONS` in
`tools/gui-react/src/stores/uiStore.ts` and the `switch` in `formatDate` +
`formatDateYMD`. One-file-rule — no other changes needed.

## Status

- ✅ **Phase 0** — Run-deletion data-loss fix (custom column preservation)
- ✅ **Phase 1** — `variants` table + dual-write
- ✅ **Phase 2** — SSOT cutover; **`variant_registry` SQL column dropped (2026-04-16)**
- ⏳ **Phase 3** — Review-grid integration + final polish

## Problem Statement

The `variant_registry` is stored as a JSON TEXT column on `color_edition_finder`.
This causes three categories of failure:

1. **Data loss on run deletion** — The summary upsert in `finderRoutes.js` and
   `deleteCandidate.js` overwrites ALL custom columns (colors, editions,
   default_color, variant_registry) with empty defaults because the minimal
   summaryRow doesn't include them and the SQL `ON CONFLICT DO UPDATE SET`
   replaces every column.

2. **No variant lifecycle management** — There is no way to delete or retire a
   variant and have that change cascade to PIF images, published field values,
   or the review grid. Variants are write-once with no edit/delete path.

3. **O(N) feature scaling** — Every new feature that depends on variants
   (release data, SKUs, pricing, discontinued status) would need its own
   array-splice logic to stay in sync. There is no relational join point.

## Target Architecture

```
variants table (SSOT)
  ├── published colors/editions  → derived from active variants
  ├── PIF images                 → joined on variant_id (already works)
  ├── release data (planned)     → FK to variant_id
  ├── SKUs (planned)             → FK to variant_id
  └── pricing (planned)          → FK to variant_id

field_candidates (evidence/audit)
  └── run history only — what each CEF run discovered
      does NOT drive published state for colors/editions
```

## Schema

```sql
CREATE TABLE IF NOT EXISTS variants (
  category            TEXT NOT NULL,
  product_id          TEXT NOT NULL,
  variant_id          TEXT NOT NULL,
  variant_key         TEXT NOT NULL,
  variant_type        TEXT NOT NULL CHECK(variant_type IN ('color','edition')),
  variant_label       TEXT DEFAULT '',
  color_atoms         TEXT DEFAULT '[]',
  edition_slug        TEXT,
  edition_display_name TEXT,
  retired             INTEGER DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT,
  PRIMARY KEY (category, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_variants_product
  ON variants(category, product_id, retired);
```

### Rebuild contract

| Audit field   | Value |
|---------------|-------|
| rebuild       | yes — from `color_edition.json` variant_registry arrays |
| source edit   | yes — variants table is user-editable via delete/retire |
| db-only       | no |

---

## CEF Identity Check Pipeline (preserved across all phases)

The Run 2+ safeguard pipeline is **unchanged** by this roadmap. The four
stages stay exactly as-is in `colorEditionFinder.js`:

```
Discovery (LLM 1)
  → Gate 1: validateColorsAgainstPalette() — every atom must exist in palette
  → Identity Check (LLM 2): compare discoveries against existing registry
      → match: same variant (preserve variant_id, update mutable fields)
      → new:   genuinely new variant (assign fresh hash)
      → reject: hallucinated/garbage (skip entirely)
  → Gate 2: validateIdentityMappings() — no duplicate matches, no slug changes
  → applyIdentityMappings() — update registry with validated mappings
  → propagateVariantRenames() — cascade key changes to PIF
```

What changes per phase (storage layer only):

| Step                   | Current                          | Phase 1 (dual-write)             | Phase 2 (cutover)                    |
|------------------------|----------------------------------|----------------------------------|--------------------------------------|
| Read existing registry | `existing.variant_registry` blob | Same (JSON doc)                  | `specDb.variants.listByProduct(pid)` |
| `applyIdentityMappings`| Unchanged                        | Unchanged                        | Unchanged                            |
| `validateIdentityMappings`| Unchanged                     | Unchanged                        | Unchanged                            |
| `buildVariantRegistry` (Run 1)| Unchanged                  | Unchanged                        | Unchanged                            |
| `propagateVariantRenames`| Unchanged                      | Unchanged                        | Unchanged                            |
| Write registry         | JSON doc + summary blob column   | JSON doc + blob + variants table | JSON doc + variants table only       |

**No validation logic, no LLM prompts, no gate logic changes.** The
protective safeguards (palette gate, identity check, slug immutability,
type guards, duplicate match rejection) all stay in `variantRegistry.js`
and the orchestrator. The variants table is a better storage layer
underneath the same logic.

---

## Phases

### Phase 0 — Bug Fix: Summary Upsert Nuke

**Goal**: Stop run deletion from wiping custom summary columns.

**Root cause**: `finderRoutes.js` DELETE run handler (lines 426-440) and
`deleteCandidate.js` cascade (lines 136-151) build a minimal summaryRow
without custom columns. The SQL upsert overwrites them with defaults.

**Fix**: When `skipSelectedOnDelete` is true, use targeted
`updateSummaryField` calls for bookkeeping columns only (cooldown_until,
latest_ran_at, run_count) instead of a full upsert. Same fix in the
cascade path.

**Files**:
- `src/core/finder/finderRoutes.js` — DELETE run + DELETE batch handlers
- `src/features/review/domain/deleteCandidate.js` — cascadeArtifactDelete

**Tests**:
- Verify run deletion preserves colors, editions, default_color, variant_registry
- Verify bookkeeping columns still update correctly

**Checkpoint**: Delete a run → summary table retains all custom columns.

---

### Phase 1 — Foundation: Variants Table + Dual-Write

**Goal**: Create the variants table and have CEF write to it alongside the
existing blob. Nothing reads from it yet — pure additive.

**Work**:
1. Add `variants` table DDL to specDb migrations
2. Create `src/db/stores/variantStore.js` — CRUD operations:
   - `upsert(row)` — insert or update a variant
   - `get(productId, variantId)` — single lookup
   - `listByProduct(productId)` — all variants for a product
   - `listActive(productId)` — non-retired only
   - `retire(productId, variantId)` — soft delete (set retired=1)
   - `remove(productId, variantId)` — hard delete
   - `removeByProduct(productId)` — delete all for a product
3. Wire into specDb (expose via `specDb.variants.*`)
4. CEF finder dual-writes: after building variant_registry, also write
   each entry to the variants table
5. Reseed: `rebuildColorEditionFinderFromJson` seeds variants table from
   JSON variant_registry arrays
6. Add rebuild path for deleted-DB scenario

**Files**:
- `src/db/specDbMigrations.js` — new table DDL
- `src/db/stores/variantStore.js` — new store (CRUD)
- `src/db/specDb.js` — wire store
- `src/features/color-edition/colorEditionFinder.js` — dual-write
- `src/features/color-edition/colorEditionStore.js` — reseed

**Tests**:
- variantStore CRUD (insert, get, list, retire, remove)
- Dual-write produces correct rows
- Reseed populates variants table from JSON

**Checkpoint**: After a CEF run, `SELECT * FROM variants` shows correct
rows. Existing behavior unchanged — blob still written, everything else
reads from blob.

---

### Phase 2 — SSOT Cutover: Derive Published State from Variants

**Goal**: Published colors/editions are derived from the variants table
instead of from candidate set_union. Variant deletion cascades to PIF,
product.json, and review grid.

**Work**:
1. **Derive published state**: New function `derivePublishedFromVariants(productId)`
   - Reads active variants → builds colors array + editions object
   - Writes to product.json `fields[colors]` and `fields[editions]`
   - Updates CEF summary columns (colors, editions, default_color)
2. **Variant delete cascade**: `deleteVariant({ productId, variantId })`
   - Remove from variants table
   - Re-derive published state (step 1)
   - Cascade to PIF: remove images, evals, carousel_slots for this variant
   - Update PIF SQL projection
3. **Variant retire** (soft delete): same cascade but sets `retired=1`
   instead of deleting — preserves audit trail
4. **CEF panel reads from variants table** instead of summary blob:
   - `buildGetResponse` queries variants table
   - Response shape: `variant_registry` from SQL, not from summary column
5. **Route endpoint**: `DELETE /color-edition-finder/:cat/:pid/variants/:variantId`
6. ✅ **Retire the blob (DONE 2026-04-16)**: Removed `variant_registry`
   from CEF `summaryColumns`; appended `ALTER TABLE color_edition_finder
   DROP COLUMN variant_registry` migration. JSON `variant_registry` in
   `color_edition.json` remains the durable SSOT. Variants table is the
   sole runtime authority.

**Files**:
- `src/features/color-edition/variantLifecycle.js` — new (derive + cascade)
- `src/features/color-edition/api/colorEditionFinderRoutes.js` — new endpoint
- `src/features/color-edition/api/colorEditionFinderRouteContext.js` — wire
- `src/core/finder/finderModuleRegistry.js` — remove variant_registry column
- `src/features/product-image/variantPropagation.js` — add delete (not just rename)
- `src/db/specDbMigrations.js` — drop column migration

**Tests**:
- Derive published from variants matches expected colors/editions
- Delete variant → published state updated, PIF cleaned
- Retire variant → same cascade, row preserved with retired=1
- CEF panel GET returns variants from table

**Checkpoint**: Delete a variant in the UI → review grid no longer shows
that color/edition, PIF images for that variant are removed, product.json
updated. Reseed from JSON still works.

---

### Phase 3 — Review Grid Integration + Polish

**Goal**: Review grid fully reflects variant-driven published state.
Clean up any remaining blob references.

**Work**:
1. **Review drawer**: published value for colors/editions comes from
   variant-derived state, not candidate set_union
2. **Green bg correctness**: Ensure `sf-candidate-resolved` and
   `sf-chip-success` reflect variant-derived published values
3. **field_candidates role clarification**: Colors/editions candidates
   are evidence only. Status column still shows which candidate sourced
   the data, but published truth comes from variants.
4. **E2E proof**: Run CEF → verify variants table → delete a variant →
   verify review grid + PIF + product.json all update correctly
5. **Cleanup**: Remove any remaining reads from the old blob column.
   Audit for dead code paths.

**Files**:
- `tools/gui-react/src/features/review/components/ReviewPage.tsx`
- `tools/gui-react/src/features/review/components/FieldReviewDrawer.tsx`
- `tools/gui-react/src/features/color-edition-finder/` — panel updates
- Various test files

**Tests**:
- Visual proof: delete variant → drawer updates
- Visual proof: CEF panel shows correct variant list
- Integration: full run → delete → verify all surfaces

**Checkpoint**: E2E on one product — all surfaces correct after variant
CRUD operations.

---

## Dependency Graph

```
Phase 0 (bug fix) ─── independent, ship immediately
      │
Phase 1 (foundation) ─── additive, no behavior change
      │
Phase 2 (cutover) ─── breaking change for published state derivation
      │
Phase 3 (integration) ─── polish + proof
```

Phase 0 is independent and should ship first to stop the bleeding.
Phases 1-3 are sequential — each depends on the previous.

## Out of Scope (Future)

- `variant_skus` table (SKU management per variant)
- `variant_releases` table (release dates per variant)
- `variant_pricing` table (pricing per variant)
- Variant-level discontinued status
- These all follow the same pattern: new table with FK to `variants(variant_id)`,
  O(1) to add once the variants table exists.
