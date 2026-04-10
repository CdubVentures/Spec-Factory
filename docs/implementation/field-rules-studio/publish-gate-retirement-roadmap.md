# Roadmap: Retire `publish_gate` and `block_publish_when_unk` (Derive from `required_level`)

**Status:** Complete
**Date:** 2026-04-10 (completed) | 2026-04-09 (planned)
**Verdict:** Both `priority.publish_gate` and `priority.block_publish_when_unk` are fully derivable from `priority.required_level`. The compiler already auto-derives both flags via the formula `(required_level === 'identity' || required_level === 'required') && !INSTRUMENTED_HARD_FIELDS.has(fieldKey)`, and `block_publish_when_unk` is always set to the same value as `publish_gate`. Across 400+ compiled fields in all categories there are zero divergences. Both flags add configuration surface area, sync risk, and cognitive load with zero independent value. Their tooltips literally say the same thing in different words.

---

## Evidence Summary

### Derivation is already 100% deterministic (in compiler)

The compiler (`compileFieldInference.js:251`) already derives both flags from `required_level`:

```javascript
const publishGate = (finalLevel === 'identity' || finalLevel === 'required') && !instrumented;
rule.publish_gate = publishGate;
rule.block_publish_when_unk = publishGate;
```

| `required_level` | Instrumented? | `publish_gate` | `block_publish_when_unk` | `publish_gate_reason` |
|---|---|---|---|---|
| `identity` | no | `true` | `true` | `'missing_identity'` |
| `identity` | yes | `false` | `false` | `''` |
| `required` | no | `true` | `true` | `'missing_required'` |
| `required` | yes | `false` | `false` | `''` |
| `critical` | any | `false` | `false` | `''` |
| `expected` | any | `false` | `false` | `''` |
| `optional` | any | `false` | `false` | `''` |
| `rare` | any | `false` | `false` | `''` |

### Current data: zero divergences across all categories

| Category | Fields with publish_gate=true | All match required_level derivation? |
|---|---|---|
| Keyboard | 18 | YES |
| Monitor | 15 | YES |
| Mouse | 14 | YES |
| **Total** | **47** | **Zero divergences** |

No field has `publish_gate=true` with `required_level` other than `identity`/`required`.
No field has `block_publish_when_unk=true` with `publish_gate=false`.

### Both tooltips say the same thing

- `publish_gate`: *"If checked, this field MUST have a non-unknown value before the product spec can be published."*
- `block_publish_when_unk`: *"If checked, products with this field set to the unknown token cannot be published."*

### Compile validation already enforces the coupling

`compileValidation.js:275-276` errors if `publish_gate=true` without `block_publish_when_unk` as boolean, proving they must always be in sync.

---

## What This Removal Changes

**Before:** Two stored boolean flags (`publish_gate`, `block_publish_when_unk`) plus a derived string (`publish_gate_reason`), all compiled into `field_rules.json`, editable via two separate checkboxes in Studio, an inline toggle in the workbench, a bulk-edit tri-state checkbox, and displayed in drawer summary panels. The validation pipeline reads `block_publish_when_unk` to decide whether to reject unk values.

**After:** The validation pipeline derives the publish-blocking decision directly from `priority.required_level` at validation time. No stored flags, no checkboxes, no sync risk. The workbench can display a derived read-only "Publish Gated" indicator computed from `required_level`. Studio operators control publishing behavior through the single `required_level` dropdown that already exists.

---

## Scope clarification

### In scope (3 flags to retire)

| Flag | Location | Action |
|---|---|---|
| `priority.publish_gate` | per-field boolean | Retire |
| `priority.block_publish_when_unk` | per-field boolean | Retire |
| `publish_gate_reason` | per-field string | Retire (only consumed by compiler, never reaches runtime) |

### Out of scope (different concept, same name)

| Property | File | Value | Why out of scope |
|---|---|---|---|
| `publish_gate` (global) | `compileAssembler.js:206` | String like `'required_complete'` | This is the global publish-gate **strategy name** for the category, not a per-field boolean. Different concept, confusing name overlap. |
| `publish_gated_fields` | `domainChecklistBuilder.js:494` | `Set` | Derived from `row.pass_target > 0` (evidence metric), not from the `publish_gate` field rule flag. |

---

## File Impact Matrix

### Validation pipeline (JS) -- derive from required_level

| File | Lines | Current | Action |
|---|---|---|---|
| `src/features/publisher/validation/validateField.js` | 38, 187-190 | Reads `block_publish_when_unk` from rule, rejects when unk | Derive from `priority.required_level` instead |
| `src/features/publisher/validation/phaseRegistry.js` | 175-185 | `isApplicable` checks `block_publish_when_unk` | Derive applicability from `required_level` |

### Compile chain (JS) -- stop emitting both flags

| File | Lines | Action |
|---|---|---|
| `src/ingest/compileFieldInference.js` | 251-259 | Remove `publish_gate`, `block_publish_when_unk`, `publish_gate_reason` derivation + assignment (6 lines) |
| `src/ingest/compileFieldRuleBuilder.js` | 229-234 | Remove normalization reads for both flags |
| `src/ingest/compileFieldRuleBuilder.js` | 502-504 | Remove `publish_gate`, `publish_gate_reason`, `block_publish_when_unk` from draft rule object |
| `src/ingest/compileFieldRuleBuilder.js` | 538-545 | Remove `publishGate` / `blockPublishWhenUnk` resolution from priority block |
| `src/ingest/compileFieldRuleBuilder.js` | 942 | Remove `publish_gate: publishGate` from final assembled rule |
| `src/ingest/compileValidation.js` | 141-150, 275-276 | Remove resolution of both flags + the coupling constraint check |

### Field rules engine (JS) -- remove path aliases and badges

| File | Lines | Action |
|---|---|---|
| `src/field-rules/consumerGate.js` | 41-42 | Remove `'priority.publish_gate'` and `'priority.block_publish_when_unk'` from `FIELD_PATH_ALIAS_DELETE_MAP` |
| `src/field-rules/consumerBadgeRegistry.js` | 97-101 | Remove `block_publish_when_unk` badge entry |

### EG presets (JS + TS) -- remove `publish_gate: false`

| File | Lines | Action |
|---|---|---|
| `src/features/studio/contracts/egPresets.js` | 179, 232 | Remove `publish_gate: false` from color/edition presets |
| `tools/gui-react/src/features/studio/state/egPresetsClient.ts` | 109, 161 | Remove `publish_gate: false` from client-side presets |

### Studio GUI (TSX) -- remove checkboxes, columns, bulk edit, drawer displays

| File | Lines | Action |
|---|---|---|
| `KeyPrioritySection.tsx` | 181-240 | Remove both checkboxes ("Publish Gate" and "Block publish when unk") |
| `WorkbenchDrawerContractTab.tsx` | 288-297 | Remove both checkboxes from drawer contract tab |
| `WorkbenchDrawerSimpleTabs.tsx` | 98-99, 137-160 | Remove `pubGate`/`blockUnk` reads + "What would fail publish" section (replace with derived indicator from required_level) |
| `WorkbenchBulkBar.tsx` | 23, 36, 40, 78-91 | Remove `bulkPubGate` state + tri-state checkbox + apply logic |
| `workbenchColumns.tsx` | 337-356 | Remove `publishGate` inline toggle column + `blockPublishWhenUnk` badge column |
| `workbenchColumns.tsx` | 483, 489, 502 | Remove from `minimal`, `contract`, `evidence` column presets |
| `workbenchColumns.tsx` | 545-546 | Remove from `ALL_COLUMN_IDS_WITH_LABELS` |
| `workbenchHelpers.ts` | 130-131 | Remove `publishGate` and `blockPublishWhenUnk` row builders |
| `workbenchTypes.ts` | 29-30 | Remove `publishGate: boolean` and `blockPublishWhenUnk: boolean` from interface |
| `workbenchInlineEditContracts.ts` | 4 | Remove `publishGate: 'priority.publish_gate'` mapping |
| `ruleCommands.ts` | 80 | Remove legacy alias sync `if (path === 'priority.publish_gate') rule.publish_gate = value;` |
| `studioConstants.ts` | 90-91 | Remove `publish_gate` and `block_publish_when_unk` from `STUDIO_TIPS` |

### Tests -- retire or rewrite

| File | Lines | Action |
|---|---|---|
| `src/features/publisher/validation/tests/validateField.test.js` | 265-321 | Rewrite: test publish gate behavior via `required_level` instead of `block_publish_when_unk` flag |
| `src/features/publisher/validation/tests/phaseRegistry.test.js` | 249-251 | Update `publish_gate` phase test to derive from `required_level` |
| `src/tests/deriveFailureValues.js` | 39, 129-132 | Derive from `required_level` instead of reading `block_publish_when_unk` |
| `src/tests/fieldContractTestRunner.js` | 229 | Derive knob entry from `required_level` instead of `block_publish_when_unk` |
| `tools/gui-react/src/features/studio/workbench/__tests__/studioWorkbenchContracts.test.js` | 54, 63, 67, 71-74 | Remove `publishGate` from fixture + assertions + path mapping test |
| `tools/gui-react/src/features/studio/state/__tests__/studioRemovedKnobStoreSanitization.test.js` | 29-32, 49-50, 52, 54, 61, 76-78, 91-92 | Remove all `publish_gate` and `block_publish_when_unk` fixtures + assertions |
| `tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js` | 75 | Remove `'priority.publish_gate'` from expected paths |
| `src/features/color-edition/tests/colorEditionCandidateGateE2E.test.js` | fixture only | Optional: strip obsolete `publish_gate`/`block_publish_when_unk` from test fixture data (no logic dependency) |

### JSON data -- strip on recompile

| Files | Action |
|---|---|
| 3x `field_studio_map.json` (keyboard, monitor, mouse) | Strip `publish_gate` and `block_publish_when_unk` from every field's priority block |
| 3x `field_rules.json` (generated) | Auto-removed after compile chain change |
| 3x `manifest.json` (generated) | Regenerated on recompile (verify clean) |
| 3x `_compile_report.json` (generated) | Regenerated on recompile (verify clean) |

### Docs -- update references

| File | Action |
|---|---|
| `docs/features-html/validator-pipeline.html` | Update publish gate phase description |
| `docs/implementation/field-rules-studio/audits/2026-04-09-mouse-field-contract-audit.html` | Review for publish gate references |
| `docs/implementation/field-rules-studio/audits/2026-04-09-keyboard-field-contract-audit.html` | Review for publish gate references |
| `docs/implementation/field-rules-studio/badge-fix/field-rules-consumer-audit.md` | Update consumer badge section |
| `docs/implementation/ai-indexing-plans/pipeline/IDX-AND-SOURCE-PIPELINE.md` | Review for publish gate references |
| `docs/implementation/ai-indexing-plans/pipeline/planning/NEEDSET-LOGIC-IN-OUT.md` | Review for publish gate references |
| `src/features/review/domain/tests/reviewGridData.layout.audit.md` | Remove publish_gate mention from audit notes |

---

## Execution Plan

### Phase 1: Characterization -- prove derivation equivalence

**Goal:** Golden-master test proving that deriving from `required_level` at runtime produces identical results to the stored `block_publish_when_unk` flag for every field in every category.

#### 1.1 -- Characterization test

- File: `src/features/publisher/validation/tests/validateField.publishGateDerivation.characterization.test.js` (new)
- Load all 3 compiled `field_rules.json` files
- For every field rule, assert:
  - `shouldBlockUnk(rule) === Boolean(rule.priority?.block_publish_when_unk)` where `shouldBlockUnk` derives from `required_level`
  - `shouldBlockUnk(rule) === Boolean(rule.priority?.publish_gate)` (they must match each other)
- If ANY field diverges, the derivation is wrong -- STOP and investigate

#### 1.2 -- Build derivation helper

- File: `src/features/publisher/validation/shouldBlockUnkPublish.js` (new, ~10 lines)
- Pure function: `(fieldRule) => boolean`
- Logic: `(required_level === 'identity' || required_level === 'required')`
- No dependency on stored `publish_gate` or `block_publish_when_unk`
- NOTE: The `INSTRUMENTED_HARD_FIELDS` exception is already baked into the `required_level` values during compilation (instrumented fields get appropriate levels). Verify this in 1.1.

#### 1.3 -- Unit test matrix for derivation helper

- Same file as 1.1, table-driven tests:
  - `identity` -> true
  - `required` -> true
  - `critical` -> false
  - `expected` -> false
  - `optional` -> false
  - `rare` -> false
  - missing/undefined -> false

**Gate:** Phase 1 must be 100% GREEN. Zero divergences across all categories.

---

### Phase 2: Wire derivation into validation pipeline

**Goal:** The publisher validation pipeline derives blocking behavior from `required_level` instead of reading stored `block_publish_when_unk`. Stored flags still exist as safety net.

#### 2.1 -- `validateField.js`

- Line 38: Replace `const blockPublishWhenUnk = fieldRule?.priority?.block_publish_when_unk || false;` with `const blockPublishWhenUnk = shouldBlockUnkPublish(fieldRule);`
- Import the new helper
- Lines 187-190: No change needed (same variable name, same logic)

#### 2.2 -- `phaseRegistry.js`

- Line 180: Replace `isApplicable: (rule) => Boolean(rule?.priority?.block_publish_when_unk)` with `isApplicable: (rule) => shouldBlockUnkPublish(rule)`
- Import the new helper

#### 2.3 -- `deriveFailureValues.js`

- Line 39: Replace `const blockPublishWhenUnk = pri?.block_publish_when_unk || false;` with derivation from `required_level`

#### 2.4 -- `fieldContractTestRunner.js`

- Line 229: Derive knob from `required_level` instead of checking `block_publish_when_unk`

#### 2.5 -- Update validation tests

- `validateField.test.js` (265-321): Rewrite test fixtures to use `required_level: 'identity'` / `required_level: 'optional'` instead of `block_publish_when_unk: true/false`
- `phaseRegistry.test.js` (249-251): Update phase applicability test

#### 2.6 -- Run full test suite

- All existing publisher tests must remain GREEN
- The characterization test from Phase 1 must still pass

**Gate:** Full test suite GREEN. Validation pipeline no longer reads stored flags. Behavior identical.

---

### Phase 3: Remove from Studio GUI

**Goal:** Remove all UI surfaces for both flags. Users control publish-blocking through `required_level` dropdown only.

#### 3.1 -- Remove checkboxes

- `KeyPrioritySection.tsx` (181-240): Remove both "Publish Gate" and "Block publish when unk" checkbox labels
- `WorkbenchDrawerContractTab.tsx` (288-297): Remove both checkboxes from drawer

#### 3.2 -- Remove workbench columns

- `workbenchColumns.tsx` (337-356): Remove `publishGate` inline toggle + `blockPublishWhenUnk` badge column definitions
- `workbenchColumns.tsx` (483, 489, 502): Remove from `minimal`, `contract`, `evidence` presets
- `workbenchColumns.tsx` (545-546): Remove from `ALL_COLUMN_IDS_WITH_LABELS`

#### 3.3 -- Remove from workbench data pipeline

- `workbenchTypes.ts` (29-30): Remove `publishGate` and `blockPublishWhenUnk` from row interface
- `workbenchHelpers.ts` (130-131): Remove both row builders
- `workbenchInlineEditContracts.ts` (4): Remove `publishGate` mapping

#### 3.4 -- Remove from drawer summary

- `WorkbenchDrawerSimpleTabs.tsx` (98-99, 137-160): Remove `pubGate`/`blockUnk` variables and the "What would fail publish" items that reference them. Replace with a single derived indicator: if `required_level` is `identity` or `required`, show "Publish gated (required_level: {level})"

#### 3.5 -- Remove from bulk bar

- `WorkbenchBulkBar.tsx` (23, 36, 40, 78-91): Remove `bulkPubGate` state, the tri-state checkbox, and the apply logic

#### 3.6 -- Remove legacy alias sync

- `ruleCommands.ts` (80): Remove `if (path === 'priority.publish_gate') rule.publish_gate = value;`

#### 3.7 -- Remove tooltips

- `studioConstants.ts` (90-91): Remove `publish_gate` and `block_publish_when_unk` from `STUDIO_TIPS`

#### 3.8 -- Remove from EG presets (client)

- `egPresetsClient.ts` (109, 161): Remove `publish_gate: false` from color/edition presets

#### 3.9 -- Update GUI tests

- `studioWorkbenchContracts.test.js` (54, 63, 67, 71-74): Remove `publishGate` from fixtures, row assertions, preset assertions, path mapping test
- `studioRemovedKnobStoreSanitization.test.js` (29-32, 49-52, 54, 61, 76-78, 91-92): Remove all `publish_gate` and `block_publish_when_unk` fixtures + assertions
- `systemMappingCoverage.test.js` (75): Remove `'priority.publish_gate'` from expected paths

**Gate:** All GUI tests GREEN. Studio UI no longer displays or edits either flag. `required_level` dropdown is the single control.

---

### Phase 4: Remove from compile chain + field rules engine

**Goal:** Compiled output no longer emits `publish_gate`, `block_publish_when_unk`, or `publish_gate_reason`.

#### 4.1 -- `compileFieldInference.js`

- Lines 251-259: Remove all 8 lines (publish_gate, block_publish_when_unk, publish_gate_reason derivation + assignment to rule/priority)

#### 4.2 -- `compileFieldRuleBuilder.js`

- Lines 229-234: Remove normalization reads for both flags
- Lines 502-504: Remove from draft rule object
- Lines 538-545: Remove resolution from priority block
- Line 942: Remove `publish_gate: publishGate` from final assembled rule

#### 4.3 -- `compileValidation.js`

- Lines 141-150: Remove resolution of `resolvedPublishGate` and `resolvedBlockPublishWhenUnk`
- Lines 275-276: Remove the coupling constraint check

#### 4.4 -- `consumerGate.js`

- Lines 41-42: Remove both path aliases from `FIELD_PATH_ALIAS_DELETE_MAP`

#### 4.5 -- `consumerBadgeRegistry.js`

- Lines 97-101: Remove the `block_publish_when_unk` badge entry

#### 4.6 -- `egPresets.js` (backend)

- Lines 179, 232: Remove `publish_gate: false` from color/edition presets

**Gate:** Compile runs clean. Generated `field_rules.json` no longer contains `publish_gate`, `block_publish_when_unk`, or `publish_gate_reason`. Publisher validation still works (derives from `required_level`).

---

### Phase 5: Data migration + recompile

**Goal:** Strip stored flags from source JSON, recompile all categories, verify clean output.

#### 5.1 -- Strip from `field_studio_map.json` (all 3 categories + test)

- `category_authority/keyboard/_control_plane/field_studio_map.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`
- `category_authority/mouse/_control_plane/field_studio_map.json`
- Remove `publish_gate`, `block_publish_when_unk`, and `publish_gate_reason` from every field's priority block

#### 5.2 -- Recompile all categories

- Verify generated `field_rules.json` has no `publish_gate`, `block_publish_when_unk`, or `publish_gate_reason`
- Verify `manifest.json` and `_compile_report.json` regenerate clean

#### 5.3 -- Re-run characterization test

- The Phase 1 characterization test should still pass (derivation from `required_level` matches expected behavior)
- Convert golden-master comparison to permanent unit test if it hasn't been already

**Gate:** Full test suite GREEN. All categories compile clean. No stored flags remain.

---

### Phase 6: Retire characterization tests + docs

#### 6.1 -- Retire golden-master characterization test

- The Phase 1 characterization file can be deleted once Phase 5 is verified
- Keep the Phase 1.3 unit test matrix for `shouldBlockUnkPublish()` as permanent contract

#### 6.2 -- Update HTML docs

- `docs/features-html/validator-pipeline.html` -- update publish gate phase description to reference `required_level` derivation
- `docs/implementation/field-rules-studio/audits/2026-04-09-mouse-field-contract-audit.html` -- review/update
- `docs/implementation/field-rules-studio/badge-fix/field-rules-consumer-audit.md` -- remove badge reference
- `docs/implementation/ai-indexing-plans/pipeline/IDX-AND-SOURCE-PIPELINE.md` -- review/update
- `docs/implementation/ai-indexing-plans/pipeline/planning/NEEDSET-LOGIC-IN-OUT.md` -- review/update

#### 6.3 -- Update this roadmap status to `Complete`

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| A field has `publish_gate=true` with `required_level` not identity/required | None (verified zero across all categories) | Phase 1 golden-master catches this before any changes |
| INSTRUMENTED_HARD_FIELDS have identity/required level but need publish_gate=false | Low | Phase 1.1 verifies; if found, add exclusion to derivation helper |
| Bulk bar removal loses useful workflow | Low | Users bulk-set `required_level` instead (already exists in bulk bar) |
| Downstream systems read `publish_gate` from compiled JSON | Low | `domainChecklistBuilder` uses `pass_target` not `publish_gate`. Phase 2 full test suite catches any hidden consumers |
| Future category needs manual override | Very low | If ever needed, add an `override_publish_gate` escape hatch -- but don't build it now |
| `compileAssembler.js:206` global `publish_gate` string confused with per-field boolean | None | Explicitly out of scope; different concept (strategy name vs per-field flag) |

---

## Execution Order

```
Phase 1 (characterization + derivation helper)     -> proves zero divergence, builds safety net
Phase 2 (wire derivation into validation pipeline)  -> runtime no longer reads stored flags
Phase 3 (remove from Studio GUI)                    -> stops displaying/editing stored flags
Phase 4 (remove from compile chain + engine)        -> stops emitting stored flags
Phase 5 (strip from JSON + recompile)               -> removes all stored values
Phase 6 (retire characterization + docs)             -> cleanup
```

Each phase must end with full test suite GREEN before proceeding to the next.
