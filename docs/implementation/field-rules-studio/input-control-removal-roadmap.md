# Roadmap: Remove `input_control` as Stored/Editable Property (Full Derivation)

**Status:** Proposed
**Date:** 2026-04-09
**Verdict:** `ui.input_control` is a frontend-only metadata field with zero runtime consumers. Its value is always deterministic from `contract.type` + `contract.shape` + `enum.source` + `enum.policy`. For tech spec categories (keyboard, monitor, mouse), there is no case where a user would need to manually override the derived widget type. The property should be replaced by a pure derivation function at render time.

---

## Evidence Summary

### Runtime consumption: NONE

| System | Reads `input_control`? | What it actually uses |
|--------|------------------------|----------------------|
| Publisher validation | No | `contract.*`, `enum.*`, `parse.*` |
| Engine extraction | No | `contract.*`, `enum.*`, `evidence.*`, `parse.*` |
| Review grid | No | `contract.*`, `ui.label`, `ui.group` |
| DB schema (specDb) | No column | N/A |
| LLM prompts | No | `contract.*`, `ai_assist.*` |
| **Studio React UI** | **Yes (only consumer)** | Renders widget type in workbench + key sections |

### Derivation is already 100% deterministic

The existing coupling logic in `ruleCommands.ts` and `typeShapeRegistry.ts` already auto-sets `input_control` whenever a user changes type, shape, or enum source. The manual selector in `KeyHintsSection.tsx` allows overrides, but no field in any category actually uses a non-derived value.

| Derivation rule | Input | Output |
|----------------|-------|--------|
| Shape is list | `contract.shape === 'list'` | `list_editor` |
| Enum source is component_db | `enum.source.startsWith('component_db.')` | `component_picker` |
| Enum source is data_lists + closed | `enum.source.startsWith('data_lists.') && enum.policy === 'closed'` | `select` |
| Enum source is yes_no | `enum.source === 'yes_no'` | `text` |
| Type is number/integer | `contract.type in ['number','integer']` | `number` |
| Type is url | `contract.type === 'url'` | `url` |
| Type is date | `contract.type === 'date'` | `date` |
| Fallback | everything else | `text` |

**Priority:** Shape > enum source > contract type > fallback (matches current coupling execution order).

---

## What This Removal Changes

**Before:** `input_control` is stored in `field_studio_map.json`, compiled into `field_rules.json` and `ui_field_catalog.json`, auto-coupled via side-effects in `ruleCommands.ts`, and manually editable via a dropdown in `KeyHintsSection.tsx`.

**After:** A pure function `deriveInputControl(rule)` computes the widget type at render time from properties the UI already has. No storage, no coupling side-effects, no manual override. The workbench can still display the derived value as a read-only computed column.

---

## File Impact Matrix

### Compile chain (JS) — remove `input_control` emission

| File | Lines | Action |
|------|-------|--------|
| `src/ingest/compileFieldRuleBuilder.js` | 467, 770 | Remove `input_control` from draft rule and ui merge |
| `src/ingest/categoryCompile.js` | 222, 461 | Remove `input_control` from uiFieldCatalogRows and rule merge |

### EG presets (JS) — remove hardcoded `input_control: 'token_list'`

| File | Lines | Action |
|------|-------|--------|
| `src/features/studio/contracts/egPresets.js` | 197, 264 | Remove `input_control` from color/edition presets |
| `src/features/studio/contracts/tests/egPresets.test.js` | 104, 210, 261 | Remove assertions on `input_control` |

### React frontend — replace stored reads with derivation function

| File | Lines | Action |
|------|-------|--------|
| `typeShapeRegistry.ts` | 25-29 | Remove `'ui.input_control'` entries from TYPE_COUPLING_MAP |
| `ruleCommands.ts` | 109, 113, 122-123, 137, 141 | Remove all `setNestedRuleValue(rule, 'ui.input_control', ...)` side-effects |
| `KeyHintsSection.tsx` | 44-53 | Remove the input_control dropdown selector entirely |
| `WorkbenchDrawerDepsTab.tsx` | 84, 90, 115 | Remove `onUpdate('ui.input_control', ...)` calls; remove display of stored value |
| `KeyComponentsSection.tsx` | 90, 115 | Remove `onUpdate('ui.input_control', ...)` call; remove display of stored value |
| `workbenchHelpers.ts` | 146 | Replace `strN(r, 'ui.input_control', 'text')` with call to `deriveInputControl(r)` |
| `workbenchTypes.ts` | 50 | Keep `uiInputControl: string` (now derived, not stored) |
| `workbenchColumns.tsx` | 464, 519, 565 | Keep column (now shows derived value); optionally rename to "Derived Control" |
| `egPresetsClient.ts` | 126, 180 | Remove `input_control: 'token_list'` from color/edition presets |
| `studioConstants.ts` | 115 | Remove `input_control` tooltip from STUDIO_TIPS |

### Tests — rewrite to test derivation function

| File | Lines | Action |
|------|-------|--------|
| `studioRuleCommands.test.js` | 31, 47, 62, 77, 92, 105, 113, 121, 132 | Remove all `input_control` coupling assertions; replace with `deriveInputControl` unit tests |
| `typeShapeRegistry.test.ts` | 125-134 | Remove `input_control` coupling assertions |
| `egLockGuards.test.js` | 94 | Remove `input_control` from fixture |

### Config — update capability registry

| File | Lines | Action |
|------|-------|--------|
| `src/field-rules/capabilities.json` | 215-219 | Remove `ui.input_control` entry (or mark status: `retired_derived`) |

### JSON data — strip on recompile

| File | Action |
|------|--------|
| 3x `field_studio_map.json` | Strip `input_control` from every field's `ui` block |
| 3x `field_rules.json` | Auto-removed after compile chain change |
| 3x `ui_field_catalog.json` | Auto-removed after compile chain change |
| 3x `manifest.json` | Regenerated on recompile (verify clean) |
| 3x `_compile_report.json` | Regenerated on recompile (verify clean) |
| `category_authority/mouse/_generated/field_rules.runtime.json` | Runtime mirror — must stay aligned with `field_rules.json` |

### HTML docs — conditional cleanup

| File | Action |
|------|--------|
| `docs/implementation/publisher/universal-validator-reference.html` | Review for `input_control` references; update or remove |
| `docs/implementation/field-rules-studio/audits/2026-04-09-mouse-field-contract-audit.html` | Review for `input_control` references; update or remove |
| `docs/implementation/normilizer-issue/normalizer-refactor.html` | Review for `input_control` references; update or remove |

---

## Execution Plan

### Phase 1: Build the derivation function + characterization tests

**Goal:** Create `deriveInputControl(rule)` and prove it returns the same value as every stored `input_control` across all 3 categories.

#### 1.1 — Create `deriveInputControl.ts`
- Location: `tools/gui-react/src/features/studio/state/deriveInputControl.ts`
- Pure function: `(rule: FieldRule) => InputControlType`
- Implements the priority table above (shape > enum source > contract type > fallback)
- No side effects, no imports beyond type definitions

#### 1.2 — Characterization proof (golden-master)
- File: `tools/gui-react/src/features/studio/state/__tests__/deriveInputControl.test.ts` (new)
- Load all 3 `field_rules.json` files
- For every field rule, assert `deriveInputControl(rule) === rule.ui.input_control`
- If ANY field diverges, the derivation logic is wrong — fix before proceeding
- This is the safety net for the entire removal

#### 1.3 — Unit test matrix for `deriveInputControl`
- Same file, table-driven tests covering every row in the derivation table
- Edge cases: missing contract, missing enum, both list shape + component_db (shape wins), etc.

**Gate:** Phase 1 must be 100% GREEN before proceeding. If any field diverges, stop and investigate.

---

### Phase 2: Wire derivation into frontend (shadow mode)

**Goal:** Frontend reads from derivation function instead of stored value, but stored value still exists as fallback. Proves no UI behavior change.

#### 2.1 — `workbenchHelpers.ts`
- Replace `strN(r, 'ui.input_control', 'text')` with `deriveInputControl(r)`
- The workbench column now shows derived value

#### 2.2 — Any other read sites
- `WorkbenchDrawerDepsTab.tsx:115` — replace `strN(currentRule, "ui.input_control")` with `deriveInputControl(currentRule)`
- `KeyComponentsSection.tsx:115` — same replacement

#### 2.3 — Visual verification
- Open studio UI, compare derived column values against stored values
- Should be identical for every field in every category

**Gate:** Studio UI shows no behavior change. All tests GREEN.

---

### Phase 3: Remove the manual editor + coupling side-effects

**Goal:** Users can no longer manually set `input_control`. Auto-coupling writes stop.

#### 3.1 — `KeyHintsSection.tsx`
- Remove the input_control dropdown (lines 44-53)
- The section becomes simpler

#### 3.2 — `ruleCommands.ts`
- Remove all 5 `setNestedRuleValue(rule, 'ui.input_control', ...)` calls (lines 109, 113, 122-123, 137, 141)
- When users change type/enum source, `input_control` is no longer written as a side-effect — the UI derives it live

#### 3.3 — `typeShapeRegistry.ts`
- Remove `'ui.input_control'` from all entries in TYPE_COUPLING_MAP (lines 25-29)

#### 3.4 — `WorkbenchDrawerDepsTab.tsx`
- Remove `onUpdate('ui.input_control', 'component_picker')` call (line 84)

#### 3.5 — `KeyComponentsSection.tsx`
- Remove `onUpdate('ui.input_control', ...)` call (line 90)

#### 3.6 — `egPresetsClient.ts`
- Remove `input_control: 'token_list'` from color/edition presets (lines 126, 180)
- Derivation function handles this: list shape + data_lists source → the correct control

#### 3.7 — `studioConstants.ts`
- Remove `input_control` entry from STUDIO_TIPS (line 115)

#### 3.8 — Test updates
- `studioRuleCommands.test.js` — Remove all 9 `input_control` coupling assertions
- `typeShapeRegistry.test.ts` — Remove `input_control` coupling assertions (lines 125-134)
- `egLockGuards.test.js` — Remove `input_control` from fixture (line 94)
- `egPresets.test.js` — Remove `input_control` assertions (lines 104, 210, 261)

**Gate:** All tests GREEN. Studio UI derives controls correctly without any stored value or coupling writes.

---

### Phase 4: Remove from compile chain + backend

**Goal:** `input_control` is no longer emitted in compiled output.

#### 4.1 — `compileFieldRuleBuilder.js`
- Line 467: Remove `input_control: inferred.shape === 'list' ? 'list_editor' : 'text'` from draft rule
- Line 770: Remove `input_control: normalizeText(ui.input_control || 'text') || 'text'` from ui merge

#### 4.2 — `categoryCompile.js`
- Line 222: Remove `input_control` from uiFieldCatalogRows
- Line 461: Remove `input_control` from rule merge

#### 4.3 — `egPresets.js`
- Lines 197, 264: Remove `input_control: 'token_list'` from backend presets

#### 4.4 — `capabilities.json`
- Remove or mark `ui.input_control` as `retired_derived`

**Gate:** Compile runs clean. `field_rules.json` and `ui_field_catalog.json` no longer contain `input_control`. Frontend still works (derives at render time).

---

### Phase 5: Data migration + recompile

**Goal:** Strip stored `input_control` from source JSON, recompile, verify.

#### 5.1 — Strip from `field_studio_map.json` (all 3 categories)
- Remove `"input_control": "..."` from every field's `ui` block in:
  - `category_authority/keyboard/_control_plane/field_studio_map.json`
  - `category_authority/monitor/_control_plane/field_studio_map.json`
  - `category_authority/mouse/_control_plane/field_studio_map.json`

#### 5.2 — Recompile all categories
- Verify generated `field_rules.json` has no `input_control`
- Verify generated `ui_field_catalog.json` has no `input_control`
- Verify `manifest.json` and `_compile_report.json` are regenerated clean (all 3 categories)
- Verify `category_authority/mouse/_generated/field_rules.runtime.json` has no `input_control` (runtime mirror must stay aligned with `field_rules.json`)

#### 5.3 — Final characterization re-run
- Re-run Phase 1.2 golden-master test (now expects derivation-only, no stored value to compare)
- Convert to a pure unit test matrix (the golden-master comparison is no longer possible once stored values are gone)

**Gate:** Full test suite GREEN. Studio UI works. All 3 categories compile clean.

---

### Phase 6: Retire characterization tests + docs

#### 6.1 — Retire golden-master comparison test
- The Phase 1.2 test that compared derived vs stored is no longer meaningful
- Keep the Phase 1.3 unit test matrix for `deriveInputControl` as the permanent contract

#### 6.2 — Schema reference + HTML docs
- Regenerate `docs/data-structure-html/schema-reference.html` (will auto-drop `input_control`)
- Review and update these HTML docs that reference `input_control`:
  - `docs/implementation/publisher/universal-validator-reference.html`
  - `docs/implementation/field-rules-studio/audits/2026-04-09-mouse-field-contract-audit.html`
  - `docs/implementation/normilizer-issue/normalizer-refactor.html`

#### 6.3 — Update this roadmap status to `Complete`

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| A field has a non-derivable `input_control` override | Low (audit shows zero) | Phase 1.2 golden-master catches this before any changes |
| EG presets (color/edition) use `token_list` which needs special derivation | Medium | Ensure derivation handles: `contract.shape === 'list' && enum source is data_lists` → `token_list` or `list_editor` (verify which is correct) |
| Future category needs a truly manual override | Low | If needed later, add an `input_control_override` field that takes precedence over derivation — but don't build it now |
| Workbench debug column disappears | None | Column stays, just shows derived value instead of stored value |

---

## EG Preset Special Case

The color/edition EG presets hardcode `input_control: 'token_list'`. The derivation function must handle this:

- Colors: `contract.shape = 'list'` + `enum.source = 'data_lists.colors'` → should derive `token_list` or `list_editor`
- Editions: `contract.shape = 'list'` + `enum.source = 'data_lists.editions'` → same

**Investigation needed in Phase 1:** Confirm whether `token_list` and `list_editor` are the same widget or different. If different, the derivation function may need a heuristic for tag-style lists vs full list editors. This is the one potential wrinkle — resolve before leaving Phase 1.

---

## Execution Order

```
Phase 1 (derivation function + golden-master)  →  MUST be GREEN, proves no divergence
Phase 2 (wire derivation into frontend)         →  shadow mode, proves no UI change
Phase 3 (remove editor + coupling writes)       →  stops writing input_control
Phase 4 (remove from compile chain)             →  stops emitting input_control
Phase 5 (strip from JSON + recompile)           →  removes all stored values
Phase 6 (retire golden-master + docs)           →  cleanup
```

Each phase must end with full test suite GREEN before proceeding to the next.
