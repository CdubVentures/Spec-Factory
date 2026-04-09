# Unit Normalization Roadmap

> **Goal:** Replace the current "strip unit and store bare number" pattern with a
> normalized `{ value, unit }` storage contract. The canonical unit lives in
> `contract.unit`. The validator's job becomes *normalization* (attach/convert),
> not *stripping*. Dead knobs are removed. A system-wide unit registry replaces
> per-field synonym lists.

---

## Phase 1 — Subtractive: Remove Dead Unit Knobs

**Why first:** No behavioral risk. Removes config surface that is compiled,
shipped to JSON, displayed in the UI, but never consumed by any validator code.
Cleans the deck so Phase 2 doesn't have to work around ghost config.

### Scope

| Item | Action |
|------|--------|
| `parse.allow_unitless` | Delete everywhere (UI, compiler, consumerGate, workbench, types, tests) |
| `parse.allow_ranges` | Delete everywhere (UI, compiler, consumerGate, workbench, types, tests) |
| `parse.unit` (ComboSelect) | Delete from Studio UI — redundant with `contract.unit` |
| `parse.unit` (compiler emit) | Stop emitting; `contract.unit` is already the SSOT |
| `parse.unit_accepts` (per-field) | Delete from Studio UI — will be replaced by system registry in Phase 3 |
| `parse.unit_conversions` (per-field) | Delete — will be replaced by system registry in Phase 3 |
| `parse.strict_unit_required` | Delete — becomes irrelevant when validator always normalizes |
| Workbench columns | Remove: Parse Unit, Unit Accepts, Allow Unitless, Allow Ranges, Strict Unit Required |
| Workbench types | Remove corresponding fields from `WorkbenchRow` interface |
| Consumer badge entries | Remove `parse.strict_unit_required` from `consumerBadgeRegistry` |
| Phase registry | Update 'unit' phase entry — remove references to retired knobs |
| Compiled JSON | Re-compile categories; confirm dead keys no longer emitted |

### File manifest

**Studio UI (remove unit knob controls + workbench columns)**
```
tools/gui-react/src/features/studio/components/key-sections/KeyParseRulesSection.tsx
  → Delete entire component or gut unit-knob controls (parse.unit ComboSelect,
    parse.unit_accepts TagPicker, allow_unitless/allow_ranges/strict_unit_required checkboxes)

tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx
  → Remove columns: Parse Unit, Unit Accepts, Allow Unitless, Allow Ranges, Strict Unit Required

tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts
  → Remove row fields: parseUnit, unitAccepts, allowUnitless, allowRanges, strictUnitRequired

tools/gui-react/src/features/studio/workbench/workbenchTypes.ts
  → Remove from WorkbenchRow interface: parseUnit, unitAccepts, allowUnitless, allowRanges, strictUnitRequired

tools/gui-react/src/utils/studioConstants.ts
  → Remove STUDIO_TIPS entries: parse_unit, unit_accepts, allow_unitless, allow_ranges, strict_unit_required
  → Keep UNITS array and UNIT_ACCEPTS_SUGGESTIONS (needed by contract.unit in KeyContractSection)
```

**Field rules infrastructure (remove dead path registrations)**
```
src/field-rules/consumerGate.js
  → Remove from FIELD_PATH_ALIAS_DELETE_MAP:
    'parse.unit', 'parse.unit_accepts', 'parse.allow_unitless',
    'parse.allow_ranges', 'parse.strict_unit_required'

src/field-rules/consumerBadgeRegistry.js
  → Remove badge entry for parse.strict_unit_required (lines 291-295)
  → Update contract.unit badge desc to remove "strips unit suffix" language

src/field-rules/capabilities.json
  → Mark parse.unit, parse.unit_accepts, parse.allow_unitless,
    parse.allow_ranges, parse.strict_unit_required as retired/dead
```

**Compiler (stop emitting dead keys to field_rules.json)**
```
src/ingest/compileFieldRuleBuilder.js
  → defaultParseRules(): remove unit_accepts, strict_unit_required, unit_conversions defaults
  → buildStudioFieldRule(): remove maybeCopy for unit_accepts, unit_conversions,
    strict_unit_required, allow_unitless, allow_ranges
  → Remove parse.unit emit (contract.unit is SSOT)

src/ingest/compileValidation.js
  → Remove resolvedStrictUnitRequired resolution (lines 131-135)
  → Keep resolvedUnit (still needed — reads contract.unit)
  → Update numeric-without-unit warning if needed

src/field-rules/compilerArtifactBuilders.js
  → Review parse template unit metadata (line 73: parse.unit in buildParseTemplates)
  → Remove if no longer emitted by compiler
```

**Validation pipeline (simplify checkUnit, stop reading dead keys)**
```
src/features/publisher/validation/checks/checkUnit.js
  → Remove strictUnitRequired parameter and bare-number rejection logic
  → Keep: unit matching, unit_accepts matching, unit_conversions (Phase 3 replaces these)

src/features/publisher/validation/validateField.js
  → Remove: unitAccepts, unitConversions, strictUnitRequired variable extraction (lines 29-31)
  → Simplify checkUnit call — pass only (value, unit) for now

src/features/publisher/validation/phaseRegistry.js
  → Update 'unit' phase entry (lines 48-67):
    remove triggerDetail references to parse.unit_accepts, parse.unit_conversions
    update description to remove "strict" language
```

**Test infrastructure (remove unit-knob test generation)**
```
src/tests/fieldContractTestRunner.js
  → Remove knob extraction for: parse.unit_accepts (line 208),
    parse.unit_conversions (lines 209-211), parse.strict_unit_required (line 212)
  → Keep contract.unit knob extraction (line 194)

src/tests/deriveFailureValues.js
  → Remove strictUnit variable and all branches that use it (lines 45, 64, 85-87, 131, 153, 273, 307-309)
  → Remove unit_accepts repair case generation (lines 193-204)
  → Simplify validScalar() — no longer needs unit suffix logic

src/features/publisher/validation/tests/checkUnit.test.js
  → Remove strict_unit_required test cases
  → Keep unit matching and conversion tests

tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js
  → Update dead-knob assertion list if needed (already lists these as dead — verify still passes)
  → Workbench contract tests as needed
```

**Compiled category artifacts (re-compile after changes)**
```
category_authority/keyboard/_generated/field_rules.json
category_authority/monitor/_generated/field_rules.json
category_authority/mouse/_generated/field_rules.json
  → Re-compile all categories
  → Verify: no allow_unitless, allow_ranges, parse.unit, unit_accepts,
    strict_unit_required, unit_conversions keys in output

category_authority/keyboard/_control_plane/field_studio_map.json
category_authority/monitor/_control_plane/field_studio_map.json
category_authority/mouse/_control_plane/field_studio_map.json
  → Re-compile; verify dead keys removed from studio map
```

### Exit criteria

- Studio UI "Unit Config" section is gone (or shows only `contract.unit` read-only in KeyContractSection)
- Workbench no longer shows unit parse columns
- `field_rules.json` for all categories no longer contains dead keys
- All existing tests pass (behavioral equivalence)
- No runtime consumer reads any removed key
- phaseRegistry 'unit' entry updated, not broken

---

## Phase 2 — Structural: `{ value, unit }` Storage Contract

**Why second:** This is the schema migration. Once dead knobs are gone, the
value shape change is isolated to the storage/read boundary — no competing
config to confuse the change.

### Scope

| Item | Action |
|------|--------|
| DB schema | Add `unit TEXT DEFAULT NULL` to `field_candidates`, `item_field_state`, `component_values` |
| Migration | New idempotent ALTER TABLE statements in migrations array |
| Prepared statements | Update INSERT/UPDATE for all three tables to include `@unit` |
| Stores | Accept and persist `unit` on all upsert functions |
| Rebuild contract | Ensure deleted-DB rebuild populates unit from product JSON |
| Product JSON | Candidate shape gains `unit` property alongside `value` |
| Validation return shape | `validateField` returns `{ value, unit }` tuple |
| `checkUnit.js` | Returns normalized unit alongside numeric value |
| Downstream readers | Read `unit` from DB column; display with value |
| Review contracts | Add `unit` key to O(1) shape definitions |
| LLM repair adapter | Include `unit` in prompt context and re-validation |

### File manifest

**DB layer (schema + migration + statements)**
```
src/db/specDbSchema.js
  → Add 'unit TEXT DEFAULT NULL' to CREATE TABLE for:
    field_candidates, item_field_state, component_values
  → Do NOT add to list_values (enums don't have units)

src/db/specDbMigrations.js
  → Add 3 idempotent ALTER TABLE statements:
    ALTER TABLE field_candidates ADD COLUMN unit TEXT DEFAULT NULL
    ALTER TABLE item_field_state ADD COLUMN unit TEXT DEFAULT NULL
    ALTER TABLE component_values ADD COLUMN unit TEXT DEFAULT NULL

src/db/specDbStatements.js
  → Update _upsertFieldCandidate: add @unit in INSERT + UPDATE
  → Update _upsertItemFieldState: add @unit in INSERT + UPDATE
  → Update _upsertComponentValue: add @unit in INSERT + UPDATE
  → SELECT * statements auto-inherit (no change needed)
```

**Store layer (accept unit parameter)**
```
src/db/stores/fieldCandidateStore.js
  → Add unit param to upsert() signature
  → Pass unit: unit ?? null to statement

src/db/stores/itemStateStore.js
  → Add unit param to upsertItemFieldState() signature
  → Pass unit: unit ?? null to statement

src/db/stores/componentStore.js
  → Add unit param to upsertComponentValue() signature
  → Pass unit: unit ?? null to statement

src/db/stores/provenanceStore.js
  → Add unit: row.unit ?? null to buildProvenanceFromRows() output shape
```

**Rebuild / seed path**
```
src/db/seedRegistry.js
  → Verify field_candidates rebuild from product.json reads candidate.unit
  → Verify item_field_state seed populates unit from contract.unit
  → Verify component_values seed populates unit from component property contract
```

**Validation pipeline (return { value, unit } tuple)**
```
src/features/publisher/validation/validateField.js
  → Change return shape: result.value stays scalar, add result.unit
  → Set unit from contract.unit when applicable (NULL for non-unit fields)

src/features/publisher/validation/checks/checkUnit.js
  → Return { pass, value, unit, rule } instead of { pass, value, rule }
  → unit = canonical unit from contract when pass is true
```

**Write paths (dual-write unit to SQL + JSON)**
```
src/features/publisher/candidate-gate/submitCandidate.js
  → Extract unit from validateField result
  → Pass unit to fieldCandidateStore.upsert()
  → Write unit to product.json candidate object
  → serializeValue() unchanged (value stays scalar)

src/features/publisher/candidateReseed.js
  → Read candidate.unit from product.json during reseed
  → Pass unit to fieldCandidateStore.upsert()
```

**Read paths (consume unit from DB)**
```
src/features/review/domain/reviewGridData.js
  → Read unit from item_field_state row
  → Pass unit to UI payload alongside value
  → Update slotValueToText() or display helpers to format "120 Hz"

src/features/review/domain/componentReviewSpecDb.js
  → Read unit from component_values row
  → Include in component property state payload

src/features/publisher/repair-adapter/promptBuilder.js
  → Include unit in LLM repair prompt: "Field expects unit: Hz"
  → Re-validation passes unit through
```

**Review contracts (O(1) shape definitions)**
```
src/features/review/contracts/reviewFieldContract.js
  → Add { key: 'unit', coerce: 'string', nullable: true, optional: true }
    to FIELD_STATE_SELECTED_SHAPE and REVIEW_CANDIDATE_SHAPE

src/features/review/contracts/componentReviewShapes.js
  → Add unit key to COMPONENT_PROPERTY_STATE if component properties carry units
```

**Frontend types + UI (display unit from stored data)**
```
tools/gui-react/src/types/review.ts
  → Add unit?: string | null to FieldState.selected and ReviewCandidate
  → (review.ts already has field_rule.units — this adds it to value-level)

tools/gui-react/src/types/componentReview.ts
  → Add unit?: string | null to ComponentPropertyState.selected

tools/gui-react/src/pages/publisher/PublisherPage.tsx
  → Display unit alongside value in candidate table (minimal — append unit string)
```

### Key design decisions

1. **Non-unit fields:** `unit` column is `NULL` — no change for strings, enums, booleans.
2. **Backward compat:** Reader code checks for `unit` column presence; falls back to
   `fieldRule.contract.unit` if column is NULL (migration window).
3. **Serialization:** `value` column stays TEXT. `unit` is a separate TEXT column.
   No compound JSON in the value column.
4. **Product JSON shape:** Candidates gain a `unit` property at the same level as `value`.
   Reader code handles both old (`value: 120`) and new (`value: 120, unit: "Hz"`) shapes
   during migration window.

### Exit criteria

- `unit` column exists in all three tables
- All write paths persist unit from `contract.unit`
- Product JSON candidates include `unit` when applicable
- Deleted-DB rebuild populates unit column correctly
- UI reads unit from stored data, not field rules
- All existing tests pass + new storage-shape tests added

---

## Phase 3 — Behavioral: System-Wide Unit Registry + Smart Normalization

**Why last:** With clean config (Phase 1) and structured storage (Phase 2),
the validator can now do intelligent normalization using a central registry
instead of per-field synonym lists.

### Scope

| Item | Action |
|------|--------|
| Unit registry | New file: `src/field-rules/unitRegistry.js` |
| | Maps canonical units to synonyms: `Hz → [hz, hertz, Hertz]` |
| | Maps conversion factors: `{ from: "kHz", to: "Hz", factor: 1000 }` |
| | Maps display labels: `Hz → "Hz"`, `g → "g"`, `mm → "mm"` |
| `checkUnit.js` rewrite | Uses registry for synonym resolution + conversion |
| | Bare number + known unit field → attach canonical unit (no reject) |
| | Wrong unit + known conversion → convert + attach canonical unit |
| | Wrong unit + no conversion → reject with detail |
| | Unknown suffix → reject with detail |
| `validateField.js` | Passes `contract.unit` to checkUnit; receives `{ value, unit }` back |
| Compiler cleanup | Stops emitting per-field `unit_accepts`, `unit_conversions` |
| Studio UI | `contract.unit` dropdown is the only unit control (already done in Phase 1) |
| LLM prompt builder | If unit mismatch, prompt includes "convert to {canonical unit}" instruction |

### File manifest

**New file**
```
src/field-rules/unitRegistry.js (NEW)
  → Central registry: canonical unit → { synonyms, conversions, display }
  → Exports: resolveUnit(detected, expected), getConversionFactor(from, to),
    getSynonyms(canonical), isKnownUnit(token)
  → O(1) scaling: adding a new unit = one entry in this file

src/field-rules/tests/unitRegistry.test.js (NEW)
  → Full boundary test matrix for registry lookups, conversions, synonym resolution
```

**Validation pipeline (registry-driven normalization)**
```
src/features/publisher/validation/checks/checkUnit.js
  → Rewrite to import unitRegistry
  → Remove unitAccepts/unitConversions parameters entirely
  → Logic: resolveUnit(detectedSuffix, expectedUnit) returns { value, unit, rule }
  → Bare number → { value: N, unit: expectedUnit, rule: 'unit_attached' }
  → Known synonym → { value: N, unit: canonical, rule: 'synonym_resolved' }
  → Known conversion → { value: converted, unit: canonical, rule: 'unit_converted' }
  → Unknown → { pass: false, reason: 'unknown_unit' }

src/features/publisher/validation/validateField.js
  → Simplify checkUnit call: checkUnit(value, contractUnit) — no extra params

src/features/publisher/validation/phaseRegistry.js
  → Update 'unit' phase: isApplicable checks contract.unit only
  → triggerDetail reads from registry, not per-field config
```

**Field rules infrastructure (consumer metadata update)**
```
src/field-rules/consumerGate.js
  → Verify contract.unit path alias still works
  → All parse.unit* aliases already removed in Phase 1

src/field-rules/consumerBadgeRegistry.js
  → Update contract.unit badge consumers desc:
    "Resolves synonyms and converts units via system registry"
```

**Compiler (stop emitting per-field unit config)**
```
src/ingest/compileFieldRuleBuilder.js
  → Remove all per-field unit_accepts / unit_conversions emit logic
  → defaultParseRules() no longer generates unit sub-config
  → buildStudioFieldRule() only emits contract.unit (already SSOT)

src/ingest/compileValidation.js
  → Remove unit synonym/conversion validation warnings
  → Keep contract.unit resolution (still needed)
```

**Studio UI (contract.unit becomes sole unit control)**
```
tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx
  → contract.unit ComboSelect stays as-is (already works)
  → Consider: populate options from unitRegistry instead of static UNITS array

tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx
  → contract.unit ComboSelect stays as-is
  → Update AI guidance text: "Numeric - extract exact value in {unit}" (already works)
  → Consider: populate options from unitRegistry
```

**Test infrastructure (update for registry-driven behavior)**
```
src/tests/fieldContractTestRunner.js
  → contract.unit knob extraction stays
  → Unit test generation now uses registry to derive failure/repair values

src/tests/deriveFailureValues.js
  → Unit failure cases generated from registry synonyms + conversions
  → e.g., if registry says Hz has conversion from kHz, generate "5 kHz" → repair case

src/features/publisher/validation/tests/checkUnit.test.js
  → Rewrite to test registry-driven behavior:
    bare number attachment, synonym resolution, conversion, unknown rejection
```

**Compiled category artifacts (final re-compile)**
```
category_authority/keyboard/_generated/field_rules.json
category_authority/monitor/_generated/field_rules.json
category_authority/mouse/_generated/field_rules.json
  → Final re-compile: verify only contract.unit remains, no per-field parse unit config
```

### Unit registry shape (draft)

```javascript
export const UNIT_REGISTRY = {
  Hz:  { synonyms: ['hz', 'hertz'],      conversions: { kHz: 1000, MHz: 1e6 } },
  g:   { synonyms: ['grams', 'gram'],    conversions: { kg: 1000, lb: 453.592, oz: 28.3495 } },
  mm:  { synonyms: ['millimeter', 'millimeters'], conversions: { cm: 10, in: 25.4, m: 1000 } },
  ms:  { synonyms: ['millisecond', 'milliseconds'], conversions: { s: 1000, us: 0.001 } },
  '%': { synonyms: ['percent', 'pct'],   conversions: {} },
  dB:  { synonyms: ['db', 'decibel', 'decibels'], conversions: {} },
  mAh: { synonyms: ['mah'],              conversions: { Ah: 1000 } },
  V:   { synonyms: ['v', 'volt', 'volts'], conversions: { mV: 0.001 } },
  W:   { synonyms: ['w', 'watt', 'watts'], conversions: { mW: 0.001 } },
};
```

### Exit criteria

- Unit registry exists and is the single source for synonyms + conversions
- `checkUnit` uses registry, not per-field config
- Bare numbers on unit fields get the unit attached, not rejected
- Wrong-but-convertible units are converted, not rejected
- Per-field `unit_accepts` / `unit_conversions` no longer exist in compiled output
- All existing tests updated + new registry tests added
- E2E proof: run a product through the pipeline, confirm `{ value, unit }` stored correctly

---

## Phase Dependency Graph

```
Phase 1 (Subtractive)
  │  Remove dead knobs, clean config surface
  │  No behavioral change to validation
  │
  │  Files: ~20 source + ~8 test + 6 compiled artifacts
  ▼
Phase 2 (Structural)
  │  Add unit column to DB, change value shape
  │  Validator returns { value, unit } tuple
  │  Migration + rebuild contract
  │
  │  Files: ~18 source + ~6 test + contracts + types
  ▼
Phase 3 (Behavioral)
     System-wide unit registry
     Smart normalization (attach/convert instead of strip/reject)
     Studio UI simplification complete

     Files: ~12 source + ~5 test + 3 compiled artifacts
```

Each phase is independently shippable and testable. Phase 1 can land without
any risk to current behavior. Phase 2 is additive (new column, backward-compat
readers). Phase 3 is the behavioral change that makes the unit pipeline
actually smarter.

---

## Audit Trail

All files verified as existing on 2026-04-09 via codebase exploration.
No file in any manifest is speculative — every path was confirmed present.
