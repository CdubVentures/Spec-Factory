# Field Studio Contract and Component System Architecture

Last updated: 2026-02-24

This document is the implementation-facing contract for Field Studio rules, workbook capture, component matching, and review payload wiring.

---

## 1. Scope

This contract covers:

- authoring surfaces in `workbook_map.json` and draft overlays
- compile and load behavior for `field_rules.json` and `component_db/*.json`
- review payload composition for item, component, and enum lanes
- flag and badge semantics used by the review UI

This contract does not define the extraction runtime in full detail. It only defines the rule and review interfaces that extraction consumes.

---

## 2. Canonical Inputs and Outputs

### Control plane inputs

- `_control_plane/field_studio_map.json` (preferred when present)
- `_control_plane/workbook_map.json` (legacy mirror)
- `_control_plane/field_rules_draft.json`
- `_control_plane/ui_field_catalog_draft.json`

### Generated outputs

- `_generated/field_rules.json`
- `_generated/field_rules.runtime.json`
- `_generated/known_values.json`
- `_generated/component_db/<type>.json`
- `_generated/ui_field_catalog.json`

### Runtime projection

- `loadCategoryConfig()` projects compiled + draft overlays.
- Review routes pass that projection into review payload builders.

### Frontend write ownership and separation

- Field Studio authoring writes are category-scoped and remain separate from global runtime settings files.
- `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` owns:
  - `PUT /api/v1/studio/{category}/field-studio-map`
  - `POST /api/v1/studio/{category}/save-drafts`
- Runtime/convergence/LLM settings are owned by separate settings authorities and persisted outside Field Studio control-plane files.
- Result: map/draft artifacts under `helper_files/{category}/_control_plane/*` are not merged into global `_runtime/settings.json` snapshots.

---

## 3. Workbook Capture Contract

### 3.1 Selected key scope

- `selected_keys` defines the active field set for the category.
- Every selected key must have an entry in `field_overrides`.
- `selected_keys` can be empty only when compile intentionally includes all extracted keys.

### 3.2 Field rule shape per key

Each `field_overrides.<field_key>` entry is expected to carry the full rule contract family:

- `contract.*`
- `parse.*`
- `enum.*` and/or `enum_policy`
- `component.*` when field is a component reference
- `evidence.*`
- `priority.*`
- `selection_policy.*`
- `ui.*`

### 3.3 Component source shape

Each `component_sources[]` entry must define:

- component identity: `type` or `component_type`
- lane roles: `roles.primary_identifier`, optional `roles.maker`, aliases, links
- property mappings in `roles.properties[]` with:
- `field_key` or `key`
- `type`
- `unit`
- `variance_policy`
- `constraints` (array)

Property mappings are the source of truth for component property columns and variance behavior.

---

## 4. Policy Support Matrix

### 4.1 Enum policy support

Compiler-supported enum policies:

- `open`
- `open_prefer_known`
- `closed`
- `closed_with_curation`

Authoring may choose a subset per category. Runtime and compile validation accept the full set above.

### 4.2 Variance policy support

Supported variance policies:

- `authoritative`
- `upper_bound`
- `lower_bound`
- `range`
- `override_allowed`

Numeric-only guard:

- `upper_bound`, `lower_bound`, and `range` are valid only for numeric properties.
- If authored on string properties, compiler coerces them to `authoritative` and emits warnings.

---

## 5. Component Identity and Aggregation Invariants

### 5.1 Canonical identity

Component row identity is strict:

- `(component_type, component_name, component_maker)`
- shared lane key format: `type::name::maker`

### 5.2 Slot aggregation invariant

For row key `K = (type, name, maker)` and slot field `F`:

```
C(K, F) = count(candidates where product_id in linked_products(K) and field_key = F)
```

This invariant applies to:

- `__name`
- `__maker`
- every property slot

No slot is allowed to use a different linked-product aggregation path.

### 5.3 Fallback guardrail

- If linked products exist for lane `K`, candidates must come from linked products only.
- Queue/pipeline fallback is allowed only when linked product count is zero.

---

## 6. Review Payload Wiring Contract

### 6.1 Route-level rule payload merge

Review routes merge:

- compiled category field rules
- session `mergedFields` overlay

This preserves non-field metadata while honoring in-session edits.

### 6.2 Declared column preservation

Component review payloads and layout must include property columns from:

- observed DB/property rows
- declared contract property keys from field rules and component source mappings

If a declared property column has no observed value rows, it must still appear in payload and drawer with null-selected state.

### 6.3 Drawer metadata requirements

For each property slot shown in drawer:

- selected value state
- variance policy
- constraints
- reason codes
- confidence color

---

## 7. Flags, Badges, and Metrics

### 7.1 Canonical actionable flags

Actionable real flags:

- `variance_violation`
- `constraint_conflict`
- `compound_range_conflict`
- `dependency_missing`
- `new_component`
- `new_enum_value`
- `below_min_evidence`
- `conflict_policy_hold`

### 7.2 Non-flag visual states

Non-actionable visual states include:

- `manual_override`
- `missing_value`
- confidence bands
- pending AI indicators

### 7.3 Metrics note

Current semantics differ by domain:

- item grid `metrics.flags` uses the actionable flag taxonomy above
- component/enum grids count rows requiring review

Treat these metrics as domain-local and do not compare them as identical counters.

---

## 8. Source Precedence and Snapshot Logic

Rule projection precedence:

1. compiled generated rules
2. draft overlays from control-plane session cache
3. explicit draft field order overlay (including `__grp::` markers)

Snapshot token derives from:

- draft timestamp
- compiled timestamp
- SpecDb sync version

---

## 9. Current Audit Status (2026-02-24)

Fixed in this audit:

- review payload now preserves declared component property columns even when observed values are blank
- review routes now pass merged field-rule payloads that include full metadata families
- mouse workbook component source alignment fixed:
- `sensor.dpi`: numeric `upper_bound`
- `sensor.ips`: numeric `upper_bound`
- `sensor.acceleration`: numeric `upper_bound`
- regression guard added to prevent drift for the three fields above

Open tracking items:

- `closed_with_curation` is compile-valid but still lacks dedicated test-mode scenario branch mapping
- `dependency_missing` production emitter path remains limited and should stay under active audit

---

## 10. Validation and Regression Checklist

Minimum checks after contract edits:

1. `node --test test/categoryCompile.test.js`
2. `node --test test/componentReviewDataLaneState.test.js`
3. `node --test test/reviewLaneContractApi.test.js`
4. `node --test test/reviewRoutesDataChangeContract.test.js test/reviewRouteSharedHelpersDataChange.test.js`

Contract-specific assertions to keep green:

- selected keys map cleanly into workbook field entries
- declared component property columns are preserved in layout and payload
- numeric variance policies stay numeric for sensor property mappings
- review route field-rule payload keeps compiled metadata plus draft/session overlays

---

## 11. Key Files

Compile/load:

- `src/ingest/categoryCompile.js`
- `src/field-rules/compiler.js`
- `src/field-rules/loader.js`

Review payload and flags:

- `src/review/reviewGridData.js`
- `src/review/componentReviewData.js`
- `src/review/keyReviewState.js`

Routes:

- `src/api/routes/reviewRoutes.js`
- `src/api/routes/studioRoutes.js`

Frontend review UI:

- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/EnumSubTab.tsx`

Frontend authoring persistence:

- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts`

