# Roadmap: Remove `manual_enum_values` Top-Level Key

**Status:** Approved for removal
**Date:** 2026-04-09
**Verdict:** The `manual_enum_values` top-level key in `field_studio_map.json` is 100% redundant. Every value it carries already exists in `data_lists[*].manual_values`. The compiler reads both, merges them, and emits `manual_enum_values` back — creating a circular duplication loop. `manual_enum_timestamps` is dead code (zero entries in all 3 categories).

---

## Evidence Summary

| Category | `manual_enum_values` keys | `data_lists` entries | Overlap | `manual_enum_timestamps` |
|----------|---------------------------|----------------------|---------|--------------------------|
| mouse    | 14                        | 16 (2 have empty manual_values) | 100% of values | does not exist |
| keyboard | 64                        | 64                   | 100% exact match | does not exist |
| monitor  | 61                        | 61                   | 100% exact match | does not exist |

### The Circular Duplication Loop

```
GUI LOAD (MappingStudioTab.tsx:157)
  reads manual_enum_values → merges into dataLists[*].manual_values
      ↓
GUI SAVE (MappingStudioTab.tsx:248)
  strips manual_enum_values → writes enum_lists[*].values = dl.manual_values
      ↓
COMPILER (compileMapNormalization.js:119)
  reads BOTH manual_enum_values AND enum_lists[*].values
  merges them → emits manual_enum_values at line 510
      ↓
RESEED (fieldStudioMapReseed.js:55)
  reads manual_enum_values → seeds list_values with source='manual'
      ↓
(loop continues on next load)
```

### What Must Be Preserved (NOT part of this removal)

- **`yes_no` boolean enum coupling** — `typeShapeRegistry.ts:25`, `ruleCommands.ts:113`. This is the boolean type auto-coupling, not the manual_enum_values concept.
- **`source='manual'` in review domain** — `enumListStore.js:282`, `enumMutationRoutes.js:306`, `candidateInfrastructure.js:54`. This is the provenance marker for user-curated values in the review UI. Completely separate concept.
- **`data_lists[*].manual_values` field** — This is the SURVIVING path. Values authored in EditableDataList.tsx TagPicker persist here.

---

## Phase 1: Characterization (Lock Down Current Behavior)

**Goal:** Golden-master tests that prove the compile pipeline produces identical output with and without `manual_enum_values`, given that `data_lists[*].manual_values` already carries the same data.

### 1.1 — Compile idempotency proof
- File: `src/ingest/tests/compileMapNormalization.manual-removal.test.js` (new)
- Test: Given a map with BOTH `manual_enum_values` and matching `data_lists[*].manual_values`, assert that removing `manual_enum_values` from the input produces identical `known_values.json` output.
- Run for all 3 categories using real `field_studio_map.json` data.

### 1.2 — Seed idempotency proof
- File: `src/db/tests/seed.manual-removal.test.js` (new)
- Test: Seed with current map (has both paths). Seed again with map where `manual_enum_values` is stripped. Assert identical `list_values` rows with `source='manual'`.

### 1.3 — GUI round-trip proof
- Test: Load a map with `manual_enum_values` in MappingStudioTab. Save. Verify the saved payload has NO `manual_enum_values` key (it already doesn't — `assembleMap()` strips it at line 248).

---

## Phase 2: Backend Removal (Compiler + Seed + Reseed)

### 2.1 — `compileMapNormalization.js` (the key duplicator)

**Remove:** Lines 119-125 (read `manual_enum_values` from input), lines 258-276 (push scratch entries from `manualEnumValuesInput`), lines 395-411 (rebuild `manualEnumValues` from input + data_lists), line 510 (emit `manual_enum_values` in output).

**Keep:** Lines 189-212 (read `data_lists[*].manual_values` — this is the surviving path). The `data_lists[*].manual_values` merge at lines 193-197 must stop referencing `manualEnumValuesInput` — it should use only `rowManualValues`.

**After:** The normalized output no longer contains `manual_enum_values`. All values flow through `data_lists[*].manual_values` only.

### 2.2 — `compileContextLoader.js`

**Remove:** Lines 214-222 (`manualEnumValues2` merge loop). This is now redundant because `data_lists[*].manual_values` is already merged into `enumLists` via the data_lists processing earlier in the same function.

**Verify:** That `data_lists[*].manual_values` is already being processed into `enumLists` upstream. If not, add that path.

### 2.3 — `fieldStudioMapReseed.js`

**Change:** Lines 55-95. Instead of reading `manual_enum_values` from the map, read `data_lists[*].manual_values` (or the compiled `enum_lists[*].values`). The `source='manual'` annotation and upsert logic stay — only the INPUT source changes.

### 2.4 — `seed.js`

**Change:** Lines 364-387. Same change as reseed — read from `data_lists[*].manual_values` instead of `manual_enum_values`. The `source='manual'` annotation stays.

### 2.5 — `studioSchemas.js`

**Remove:** Line 110 (`manual_enum_values` from StudioConfigSchema). Keep `manual_values` on DataListEntrySchema (line 89) — that's the surviving field.

---

## Phase 3: GUI Removal

### 3.1 — `MappingStudioTab.tsx`

**Remove:** Lines 157-161 (read `manual_enum_values` from wbMap), lines 183-197 (push scratch entries from `manualMap`), line 215 comment, line 219 (destructure `manual_enum_values` from seed base), line 248 (destructure `manual_enum_values` from save payload — already strips it, but the destructure can be removed).

**Keep:** Lines 164-182 (read `data_lists` / `enum_lists` with `manual_values` — this is the surviving path).

### 3.2 — `studioPagePersistence.ts`

**Remove:** Lines 62-70 (rename keys in `manual_enum_values` during field key rename). The rename logic for `data_lists[*].manual_values` is handled elsewhere.

### 3.3 — `EnumConfigurator.tsx`

**Rename tab:** The "Manual Values" tab (line 251) is misleading. It only shows `yes_no` boolean info. Consider renaming to "Boolean" or removing the tab entirely — it's display-only and `yes_no` coupling is automatic via `typeShapeRegistry.ts`.

### 3.4 — `WorkbenchDrawerDepsTab.tsx`

**Review:** Lines 238-260 show "Manual values (N) - locked to authoritative" label. This references `knownValues[field]` which comes from compiled output, not from `manual_enum_values` directly. Should survive but label may need updating.

### 3.5 — Type definitions

**Remove `manual_enum_values` from:**
- `tools/gui-react/src/types/studio.ts` line 107
- `tools/gui-react/src/features/studio/components/studioSharedTypes.ts` (if referenced)

**Keep `manual_values` on:**
- `EnumEntry` interface (studio.ts line 74)
- `DataListEntry` interface (studio.ts line 84, studioSharedTypes.ts line 11)

### 3.6 — `studioConstants.ts`

**Remove:** Line 113 (`enum_value_source` tooltip referencing "Manual: type values directly"). Update to reflect that values are authored in the data_lists section.

---

## Phase 4: Data Migration (JSON Files)

### 4.1 — Strip `manual_enum_values` from all 3 `field_studio_map.json` files

Before stripping, verify one final time that every value in `manual_enum_values[field]` exists in the corresponding `data_lists[*].manual_values` (or `enum_lists[*].values`).

- `category_authority/mouse/_control_plane/field_studio_map.json`
- `category_authority/keyboard/_control_plane/field_studio_map.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`

### 4.2 — Strip `manual_enum_timestamps` (dead code)

Remove from all 3 files. Zero entries exist — pure dead code.

### 4.3 — Recompile all categories

Run the compiler for all 3 categories. Verify `known_values.json` output is identical before and after removal.

---

## Phase 5: Test Updates

### Tests to RETIRE or REWRITE

| File | What to change |
|------|---------------|
| `src/db/tests/keyboard.contract.test.js:151-351` | Remove `EXPECTED_MANUAL_ENUM_FIELDS` constant and `manual_enum_values` assertions. Replace with assertions on `data_lists[*].manual_values`. |
| `src/db/tests/monitor.contract.test.js:157-363` | Same as keyboard. |
| `src/features/review/tests/reviewEcosystem.specdb.test.js:59` | Update fixture to seed via `data_lists[*].manual_values` instead of `manual_enum_values`. |
| `src/features/review/tests/helpers/reviewEcosystemHarness.js:449-541` | Update `seedWorkbookMap()` and `buildWorkbookMapSeed()` to use `data_lists` format. |
| `src/features/review/tests/fixtures/reviewLaneFixtures.js:87` | Remove `manual_enum_values: {}` default. |
| `src/features/review/tests/reviewEcosystem.timestamps.test.js:163-172` | Remove `manualEnumTimestamps` from fixtures (dead code). |
| `src/features/review/tests/reviewEcosystem.enum.test.js:102-105` | Remove `manualEnumTimestamps` from fixtures. |
| `tools/gui-react/.../studioPagePersistence.contracts.test.js:267-299` | Remove manual_enum_values preservation test. |

### Tests to KEEP (protect surviving paths)

| File | Why it survives |
|------|----------------|
| `src/ingest/tests/categoryCompile.validation.test.js:57` | Tests `data_lists[*].manual_values` scratch path — this is the surviving path. |
| `src/ingest/tests/mouse.compile.component-properties.test.js:384` | Tests `manual_values` on data_lists entries — surviving path. |
| `src/db/tests/enumPolicyTransition.test.js:142` | Tests `source='manual'` in review domain — separate concept, must keep. |
| `tools/gui-react/.../studioRuleCommands.test.js:29` | Tests `yes_no` boolean coupling — separate concept, must keep. |

---

## Phase 6: Docs & Schema Reference

- `scripts/generateSchemaReference.js:225` — Remove `manual_enum_values` from schema reference generation.
- `docs/data-structure-html/schema-reference.html:459` — Will be regenerated.
- `src/field-rules/capabilities.json` — Review for any `manual_enum_values` references.

---

## Phase 7: Cleanup Dead Code

### `manual_enum_timestamps` removal (dead across entire codebase)

These files reference `manual_enum_timestamps` but zero data exists:

| File | Lines | Action |
|------|-------|--------|
| `compileMapNormalization.js` | (if any) | Remove timestamp handling |
| `fieldStudioMapReseed.js` | 58-59, 70, 78 | Remove `manualEnumTimestamps` variable and `sourceTimestamp` assignment |
| `seed.js` | 369, 376-377, 383 | Remove `manualEnumTimestamps` variable and `sourceTimestamp` assignment |
| `reviewEcosystemHarness.js` | 375-383, 449-451 | Remove `manualEnumTimestamps` parameter |
| `reviewEcosystem.enum.test.js` | 102-105 | Remove timestamp fixture data |
| `reviewEcosystem.timestamps.test.js` | 163-172 | Remove timestamp fixture data |

---

## Execution Order

```
Phase 1 (characterization)  →  must be GREEN before anything else
Phase 2 (backend removal)   →  compiler + seed + reseed changes
Phase 3 (GUI removal)       →  types + components + persistence
Phase 4 (data migration)    →  strip JSON files + recompile
Phase 5 (test updates)      →  retire/rewrite tests
Phase 6 (docs)              →  regenerate schema reference
Phase 7 (dead code)         →  manual_enum_timestamps cleanup
```

Each phase must end with full test suite GREEN before proceeding to the next.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Mouse has 2 extra data_lists entries (lift_notes, polling) not in manual_enum_values | Both have empty manual_values — non-issue |
| Reseed/seed currently reads manual_enum_values as source='manual' | Must switch to reading data_lists[*].manual_values with same source='manual' annotation |
| EnumConfigurator "Manual Values" tab | Only shows yes_no boolean — separate concept, rename or simplify |
| Review domain source='manual' | Completely separate concept — NOT part of this removal |
| compileFileIo.js:128 (saveFieldStudioMap) | No explicit manual_enum reference — writes whatever map is passed. No change needed. |
