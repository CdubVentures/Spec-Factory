# Phase 3 — UI restructure

**Class:** `[CLASS: BEHAVIORAL]`

## Goal

Make the new model visible to authors:

1. Delete the "Components" panel from Key Navigator (and its body, section, drawer tab, dispatcher routing).
2. `EnumConfigurator` shows a 🔧 lock badge + "Component Property Key" label when `enum.source` matches `component_db.*`. Locked keys allow only `enum.policy` and the new `enum.pattern` knob.
3. `EditableComponentSource` (Field Studio Map editor) becomes the single place to configure components. Component Type picker is a strict select sourced from existing keys (not yet locked). Selecting a key auto-rewrites the matching field rule on save (sets `enum.source`, locks contract.type/shape).
4. Add new `enum.pattern` regex field with live-validation against the rendered preview value.
5. Form-level fix on `EditableComponentSource` so the "sheet required when mode=sheet" 400 doesn't happen — sane defaults + inline validation.

## Pre-requisites

Phase 1 + Phase 2 merged. `component.*` block already gone from rules. Workbench `componentLocked` column already derived. Lock state derivable from `enum.source` alone.

## Files touched

### Delete: Key Navigator Components panel

- **Delete file:** `tools/gui-react/src/features/studio/components/key-sections/bodies/KeyComponentsBody.tsx`
- **Delete file:** `tools/gui-react/src/features/studio/components/key-sections/KeyComponentsSection.tsx`
- `tools/gui-react/src/features/studio/components/KeyNavigatorTab.tsx`
  - Remove `KeyComponentsSection` import
  - Remove the `<KeyComponentsSection ... />` JSX block
  - Update the empty-state copy to drop "Components" from the panel list
- `tools/gui-react/src/features/studio/components/key-sections/index.ts`
  - Drop `KeyComponentsSection` re-export

### Drawer: 9 → 8 tabs

- `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
  - `DrawerTab` union: drop `'components'`
- `tools/gui-react/src/features/studio/workbench/WorkbenchDrawer.tsx`
  - `DRAWER_TABS` array: remove the Components entry
  - `DRAWER_TAB_IDS`: remove `'components'`
  - `EG_EDITABLE_TABS` unchanged (still `tooltip` + `search`)
- `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerTabContent.tsx`
  - Remove the `if (activeTab === 'components')` branch
  - Remove `KeyComponentsBody` import
- `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerTabPanels.tsx`
  - Remove `KeyComponentsBody` re-export

### Tests: drawer routing

- `tools/gui-react/src/features/studio/workbench/__tests__/workbenchDrawerTabContentContracts.test.js`
  - Drop the `'components'` entry from `TAB_TO_BODY` array
  - Tests now expect 8 routes, not 9

### `EnumConfigurator` lock display + `enum.pattern`

- `tools/gui-react/src/features/studio/components/EnumConfigurator.tsx`
  - Add derivation: `const isComponentLocked = strN(rule, 'enum.source').startsWith('component_db.');`
  - When `isComponentLocked`:
    - `enum.source` field renders read-only with 🔧 badge
    - Add a small read-only label below: **"Component Property Key"** with the resolved component type (e.g., "← sensor")
    - All other contract knobs locked: `contract.type`, `contract.shape` already coerced; `enum.allow_new_components`, `enum.match.*` etc. — locked or hidden
    - `enum.policy` stays editable
    - `enum.pattern` (new) stays editable
  - Add new `enum.pattern` text input:
    - String regex
    - Live validation: when present, validate the panel's preview value (if any) against the regex; show ✓/✗ indicator
    - Tooltip: "Optional regex pattern. Values are validated against this on every save."
  - Tooltip for the lock badge: "This key is locked as a component. Source is owned by the Field Studio Map."

### `EditableComponentSource` rewrite

- `tools/gui-react/src/features/studio/components/EditableComponentSource.tsx`
  - **Component Type picker:** replace the `ComboSelect` (free-text-with-suggestions) with a strict `<select>` sourced from:
    - `editedFieldOrder` (all keys in the category)
    - Filtered to keys NOT already locked (= no other `component_sources[]` entry references them)
    - PLUS the current row's component_type (so editing an existing row stays selectable)
  - On save (or on change with auto-save):
    - Detect if `component_type` changed
    - If so, the OLD locked key is unlocked (its `enum.source` is reset to `""` or null) — delegate via existing `updateField` API on the rules store
    - The NEW locked key gets `enum.source = "component_db." + newKey`, `contract.type = "string"`, `contract.shape = "scalar"` written via `updateField`
  - **Sheet defaults + validation:**
    - When creating a new component_sources row, default `mode='sheet'` AND `sheet=''`
    - Add inline validation: red border + helper text when `mode === 'sheet'` and `sheet === ''`
    - Block the save button (form-level) until sheet is filled
    - This prevents the `400 sheet is required when mode=sheet` from ever reaching the server

### Hardcoded `COMPONENT_TYPES` removal

- `tools/gui-react/src/utils/studioConstants.ts`
  - Delete the `COMPONENT_TYPES` const entirely
- All consumers either go away (KeyComponentsBody, EditableComponentSource) or already derive dynamically via `componentSources` lookup

### `EnumConfigurator` "Component DB" picker (if it exists separately)

- Verify whether `EnumConfigurator` has a "Component DB" select in addition to `KeyComponentsBody`'s. If yes:
  - Source from `componentSources.map(cs => cs.component_type)` (= dynamic)
  - Restrict to read-only when locked

### State / store updates

- `tools/gui-react/src/features/studio/state/useFieldRulesStore.ts` / `studioFieldRulesController.ts`
  - The lock guard for `updateField` — when `enum.source.startsWith('component_db.')` AND `selfKey === <derived owner>`, allow only writes to:
    - `enum.policy`
    - `enum.pattern`
    - All paths already in the existing EG-editable list (`ui.aliases`, `search_hints.*`, `ui.tooltip_md`, `priority.*`, `ai_assist.*`, `evidence.*`, `constraints[]`, `ui.label`, `ui.group`, `ui.order`)
  - Block writes to `contract.type`, `contract.shape`, `contract.unit`, `enum.source`, `enum.allow_*`, etc.
  - The lock guard for delete — when `enum.source.startsWith('component_db.')` AND key matches, deletion is blocked OR cascades to also remove the matching `component_sources[]` entry (decision: **block** — deletion goes through the Field Studio Map editor instead)

### Backend schema for `enum.pattern`

- `src/features/studio/contracts/studioSchemas.js`
  - Add `enum.pattern: z.string().optional()` to the field rule schema
- `src/ingest/compileFieldRuleBuilder.js`
  - Pass `enum.pattern` through to compile output (no transformation)
- `src/features/publisher/validation/checks/checkEnum.js` (or wherever values are validated)
  - When `enum.pattern` is set, validate values against the regex; reject on mismatch
  - Add a new validation check kind `enum.pattern.mismatch`

### Tests

- New unit tests for:
  - `enum.pattern` validation (matches, mismatches, missing)
  - Lock guard preventing `contract.type` writes on locked keys
  - Lock guard ALLOWING `enum.policy` and `enum.pattern` writes on locked keys
  - `EditableComponentSource` auto-link on save (mock the store, verify the right `updateField` calls)
  - `EditableComponentSource` sheet-required form gate
- Update existing drawer routing test (8 routes)
- Update `EnumConfigurator` test for the new lock display
- Update `KeyNavigatorTab` test (if any) for the panel removal

### Generated artifacts

- No regeneration needed for Phase 3 by itself (no compile-output schema changes beyond `enum.pattern` becoming optional, which is additive)
- After Phase 4 merges, regenerate to verify all locked keys have correct `enum.source`

## Validation steps

1. `npx tsc --noEmit` clean
2. Targeted tests green
3. Drawer routing test green with 8 tabs
4. GUI smoke:
   - Open a sensor field in Key Navigator — Components panel **gone**; Enum Policy panel shows 🔧 badge + "Component Property Key" label + read-only enum.source
   - `enum.policy` editable; `enum.pattern` editable; everything else locked
   - Open Field Studio Map editor → add a new component → strict-select dropdown of available keys; can't free-text "component" anymore
   - Save → matching field rule auto-locks (verify in Key Navigator that contract.type=string + enum.source set)
   - Old key (if changing) unlocks
   - Try saving a component_sources row with empty `sheet` → form blocks save inline (no 400)
   - Workbench drawer opens → 8 tabs (no Components tab)
   - Workbench `Component Lock` 🔧 column shows correctly for sensor/switch/encoder/panel keys

## Risks

**Lock guard regression:** the EG-lock pattern is well-tested. Component-lock reuses the same machinery but with a different criteria (`enum.source.startsWith('component_db.')`). Bug surface: if a key is BOTH EG-locked AND component-locked, the editable-paths intersection should be: only paths editable under both. Test fixture matrix needed.

**Auto-link race:** when the user changes Component Type from sensor → switch in EditableComponentSource, two `updateField` calls fire (unlock old, lock new). If the store batches updates differently across these, ordering could matter. Test: verify both old key and new key end up in correct lock state regardless of which write lands first.

## Out of scope

- Compile-time orphan check both directions — Phase 4
- Stricter lock-guard behavior (e.g., warning vs blocking) — Phase 4 if needed
- Migration of historical field rules that have `component.*` set but no matching `component_sources[]` entry — Phase 4 (the orphan check will flag these)

## Estimated touches

~15 files modified, 2 deleted, ~8 test files updated. Single commit.
