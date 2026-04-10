# Roadmap: Retire `contract.unknown_token` & `contract.unknown_reason_required`

**Status:** Planned
**Date:** 2026-04-10
**Knobs being removed:** `contract.unknown_token`, `contract.unknown_reason_required`
**Verdict:** Both knobs are deferred with `consumer: null`. The runtime hardcodes `'unk'` everywhere. Zero divergence across 301 field rules in 3 categories. These are dead config — remove them.

---

## What Survives

The internal `'unk'` sentinel and its normalization infrastructure are **not** being removed. Only the per-field configurability knobs are being retired.

**Stays (no changes):**

```
src/features/publisher/validation/unkTokens.js        → UNK_TOKENS set (input normalizer)
src/shared/valueNormalizers.js                         → UNKNOWN_VALUE_TOKENS set + hasKnownValue()
src/features/publisher/validation/absenceNormalizer.js → Step 0 canonicalization (always returns 'unk')
src/features/publisher/validation/shouldBlockUnkPublish.js → Derivation from required_level
```

**Dies:**

```
contract.unknown_token          → per-field sentinel selector (always 'unk', never diverges)
contract.unknown_reason_required → per-field reason flag (always true, never wired)
UNKNOWN_TOKENS constant         → dropdown options for a knob that doesn't do anything
STUDIO_TIPS.unknown_token       → tooltip for dead knob
STUDIO_TIPS.require_unknown_reason → tooltip for dead knob
```

---

## Evidence Summary

### Zero divergence across all categories

| Category | Fields | `unknown_token` value | `unknown_reason_required` value | Divergences |
|----------|--------|-----------------------|---------------------------------|-------------|
| keyboard | 103    | `'unk'` (all)         | `true` (all)                    | 0           |
| mouse    | 85     | `'unk'` (all)         | `true` (all)                    | 0           |
| monitor  | 113    | `'unk'` (all)         | `true` (all)                    | 0           |
| **Total**| **301**| **100% default**      | **100% default**                | **0**       |

### Capabilities registry confirms dead status

```json
"contract.unknown_token": {
  "status": "deferred",
  "consumer": null,
  "reason": "Runtime hardcodes 'unk'; will wire when categories need different tokens"
},
"contract.unknown_reason_required": {
  "status": "deferred",
  "consumer": null,
  "reason": "Runtime hardcodes true; will wire when some fields allow unk without reason"
}
```

### Runtime already hardcodes the behavior

The validation pipeline normalizes 12+ absence synonyms (`n/a`, `unknown`, `tbd`, `not available`, etc.) down to the literal `'unk'` at Step 0. The per-field knob is read exactly once — `fieldRule?.contract?.unknown_token || 'unk'` — and the fallback always wins because no field sets a custom value.

---

## What This Removal Changes

| Before | After |
|--------|-------|
| Every compiled field rule carries `unknown_token: "unk"` and `unknown_reason_required: true` | Neither property exists in compiled output |
| Studio UI shows a disabled dropdown for unknown token selection | No unknown token UI in Studio |
| `validateField.js` reads `contract.unknown_token` with fallback | Hardcoded `'unk'` literal |
| `phaseRegistry.js` reads knob for tooltip string | Hardcoded `'unk'` in tooltip |
| `capabilities.json` lists 2 deferred entries | Entries removed |

---

## Scope Clarification

### In scope (being retired)

| Knob | Location | Why |
|------|----------|-----|
| `contract.unknown_token` | Field rule contract object | Deferred, no consumer, 100% default |
| `contract.unknown_reason_required` | Field rule contract object | Deferred, no consumer, 100% default |
| `UNKNOWN_TOKENS` constant | `studioConstants.ts` | Dropdown options for dead knob |
| `STUDIO_TIPS.unknown_token` | `studioConstants.ts` | Tooltip for dead knob |
| `STUDIO_TIPS.require_unknown_reason` | `studioConstants.ts` | Tooltip for dead knob |
| Deferred-locked entries | `studioBehaviorContracts.ts` | Guard for dead knob |

### Out of scope (NOT being retired)

| Thing | Location | Why out of scope |
|-------|----------|------------------|
| `UNK_TOKENS` set | `unkTokens.js` | Active Step 0 normalizer — converts input synonyms to `'unk'` |
| `UNKNOWN_VALUE_TOKENS` set | `valueNormalizers.js` | Active `hasKnownValue()` driver for review UI |
| `shouldBlockUnkPublish()` | `shouldBlockUnkPublish.js` | Active derivation from `required_level` |
| `'unk'` literal sentinel | Pipeline-wide | The canonical absence marker — fundamental to validation |
| `unk_blocks_publish` rejection | `validateField.js` | Active publish gate behavior |
| `publish_gate` phase | `phaseRegistry.js` | Active phase — only the knob-read in its tooltip changes |
| `normalizeUnknownToken()` | `slotValueShape.js` | Slot-level normalizer — doesn't read per-field knob |

---

## File Impact Matrix

### Layer 1 — Runtime / Validation

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/features/publisher/validation/validateField.js` | 40 | `unknownToken = fieldRule?.contract?.unknown_token \|\| 'unk'` | Hardcode `const unknownToken = 'unk'` |
| `src/features/publisher/validation/phaseRegistry.js` | 181 | `const token = rule?.contract?.unknown_token \|\| 'unk'` | Hardcode `const token = 'unk'` |

### Layer 2 — Compiler / Ingest

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/ingest/compileFieldRuleBuilder.js` | 546-549 | Normalizes `unknown_token` + `unknown_reason_required` from fallback sources | DELETE normalization block |
| `src/ingest/compileFieldRuleBuilder.js` | 812-813 | Outputs both fields to contract object | DELETE output lines |

### Layer 3 — Config / Registry

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/field-rules/capabilities.json` | 51-62 | Two deferred capability entries | DELETE both entries |
| `src/field-rules/consumerGate.js` | 36 | Path alias for `contract.unknown_token` | DELETE alias entry |
| `docs/features-html/validator-pipeline.html` | 158 | `contract.unknown_token` in field-contract audit table | UPDATE — remove row or mark as retired |
| `docs/features-html/validator-pipeline.html` | 409-410 | Publish-gate phase reads `contract.unknown_token` | UPDATE — replace with hardcoded `'unk'` in description |

### Layer 4 — Studio UI (Frontend)

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `tools/gui-react/src/utils/studioConstants.ts` | 11 | `UNKNOWN_TOKENS` constant | DELETE |
| `tools/gui-react/src/utils/studioConstants.ts` | 77, 80 | `STUDIO_TIPS.unknown_token`, `.require_unknown_reason` | DELETE both tips |
| `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx` | 23, 104-105 | Import + ComboSelect for unknown token | DELETE import + UI block |
| `tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx` | 17, 166-178, 426-452 | Import + tooltip + ComboSelect + checkbox + reason tooltip | DELETE import + all unknown_token/reason UI blocks |
| `tools/gui-react/src/features/studio/state/egPresetsClient.ts` | 71-72, 137-138 | `unknown_token` + `unknown_reason_required` in presets | DELETE from both presets |
| `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts` | 117 | `unknownToken: strN(r, 'contract.unknown_token', 'unk')` | DELETE mapping |
| `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx` | 240-246, 396, 445 | Column definition + contract preset + filter config for `unknownToken` | DELETE column def, remove from preset array, remove filter entry |
| `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts` | 17 | `unknownToken: string` type field | DELETE property from type |
| `tools/gui-react/src/features/studio/state/studioBehaviorContracts.ts` | 46, 48 | Both fields in `STUDIO_DEFERRED_CONTRACT_LOCKED_FIELDS` | DELETE both entries |

### Layer 5 — Backend Presets

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/features/studio/contracts/egPresets.js` | 134-135, 207-208 | `unknown_token` + `unknown_reason_required` in presets | DELETE from both presets |

### Layer 6 — Test Helpers

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/tests/deriveFailureValues.js` | 42 | `unknownToken = c.unknown_token \|\| 'unk'` | Hardcode `const unknownToken = 'unk'` |
| `src/tests/fieldContractTestRunner.js` | 204 | Reports `contract.unknown_token` knob info | DELETE knob report line |

### Layer 7 — Test Fixtures (remove knob from sample data)

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `src/features/color-edition/tests/colorEditionCandidateGate.test.js` | 48, 56 | `unknown_token: 'unk'` in fixtures | DELETE from fixtures |
| `src/features/color-edition/tests/colorEditionCandidateGateE2E.test.js` | 23, 64 | `unknown_token: 'unk'` in fixtures | DELETE from fixtures |
| `src/features/publisher/candidate-gate/tests/submitCandidate.test.js` | 15, 22, 30, 36 | `unknown_token: 'unk'` in 4 fixtures | DELETE from all fixtures |
| `src/features/publisher/tests/discoveryEnumIntegration.test.js` | 13 | `unknown_token: 'unk'` in fixture | DELETE from fixture |
| `tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js` | 88-92 | Asserts knob is removed from field system map | DELETE assertion block |
| `tools/gui-react/src/features/studio/__tests__/studioBehaviorContracts.test.js` | 88, 90, 96, 99-103 | Deferred-locked + tooltip + fallback tooltip assertions | DELETE all unknown_token/reason assertions |

### Layer 8 — Generated Data (auto-regenerated)

| File | Pairs removed | Action |
|------|---------------|--------|
| `category_authority/keyboard/_generated/field_rules.json` | ~103 | Recompile after Phase 2 |
| `category_authority/mouse/_generated/field_rules.json` | ~85 | Recompile after Phase 2 |
| `category_authority/monitor/_generated/field_rules.json` | ~113 | Recompile after Phase 2 |
| `category_authority/keyboard/_control_plane/field_studio_map.json` | ~103 | Recompile after Phase 2 |
| `category_authority/mouse/_control_plane/field_studio_map.json` | ~80 | Recompile after Phase 2 |
| `category_authority/monitor/_control_plane/field_studio_map.json` | ~113 | Recompile after Phase 2 |

### Layer 9 — Bundled Dist

| File | Action |
|------|--------|
| `tools/dist/launcher.cjs` | Rebuilt automatically after source changes |

---

## Execution Plan

### Phase 1: Characterization — prove zero divergence and lock behavior

**Goal:** Write a characterization test that proves every field across all categories uses the default values, and that the runtime behavior is identical with or without the knob.

#### 1.1 -- Zero-divergence audit test

Write a one-time characterization test that loads all 3 category `field_rules.json` files and asserts:
- Every field's `contract.unknown_token === 'unk'`
- Every field's `contract.unknown_reason_required === true`
- Zero exceptions

#### 1.2 -- Behavioral equivalence proof

Write a characterization test in `validateField` that proves:
- A field rule WITH `contract.unknown_token: 'unk'` produces identical validation results to a field rule WITHOUT the property
- The `|| 'unk'` fallback is exercised in 100% of cases

#### 1.3 -- Snapshot current publish-gate behavior

Run the full test suite and capture baseline. Every existing test must be green before any changes.

**Gate:** All characterization tests GREEN. Full suite GREEN. Zero divergences confirmed.

---

### Phase 2: Runtime + Compiler — hardcode sentinel and stop emitting

**Goal:** Remove all per-field reads of the knob from runtime code, hardcode the `'unk'` literal, and stop the compiler from emitting both fields.

#### 2.1 -- Runtime hardcoding

**File:** `src/features/publisher/validation/validateField.js`
- Line 40: Replace `fieldRule?.contract?.unknown_token || 'unk'` with `'unk'`

**File:** `src/features/publisher/validation/phaseRegistry.js`
- Line 181: Replace `rule?.contract?.unknown_token || 'unk'` with `'unk'`

**File:** `src/tests/deriveFailureValues.js`
- Line 42: Replace `c.unknown_token || 'unk'` with `'unk'`

**File:** `src/tests/fieldContractTestRunner.js`
- Line 204: Delete the knob report line for `contract.unknown_token`

#### 2.2 -- Compiler removal

**File:** `src/ingest/compileFieldRuleBuilder.js`
- Lines 546-549: Delete the normalization block for `unknown_token` and `unknown_reason_required`
- Lines 812-813: Delete the output lines that write both fields to the contract object

#### 2.3 -- Config cleanup

**File:** `src/field-rules/capabilities.json`
- Lines 51-62: Delete both `contract.unknown_token` and `contract.unknown_reason_required` entries

**File:** `src/field-rules/consumerGate.js`
- Line 36: Delete the `contract.unknown_token` path alias

#### 2.4 -- Documentation update

**File:** `docs/features-html/validator-pipeline.html`
- Line 158: Remove `contract.unknown_token` row from the field-contract audit table (or mark retired)
- Lines 409-410: Update publish-gate phase description — replace knob reference with hardcoded `'unk'` sentinel

#### 2.5 -- Recompile all categories

Run the category compiler for keyboard, mouse, and monitor. Verify:
- `field_rules.json` no longer contains `unknown_token` or `unknown_reason_required` in any field
- `field_studio_map.json` no longer contains either property

#### 2.6 -- Run tests

**Gate:** Full test suite GREEN. Characterization tests from Phase 1 updated to assert the fields are absent (not present with defaults). Recompiled JSON verified clean.

---

### Phase 3: Studio UI + Preset cleanup — remove all user-facing surface

**Goal:** Remove all UI controls, constants, tooltips, presets, and state management related to both knobs.

#### 3.1 -- Frontend constants

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- Line 11: Delete `UNKNOWN_TOKENS` constant
- Line 77: Delete `STUDIO_TIPS.unknown_token`
- Line 80: Delete `STUDIO_TIPS.require_unknown_reason`

#### 3.2 -- Workbench drawer

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx`
- Line 23: Remove `UNKNOWN_TOKENS` import
- Lines 104-105: Delete the Unknown Token label + ComboSelect block

#### 3.3 -- Key contract section

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx`
- Line 17: Remove `UNKNOWN_TOKENS` import
- Lines 166-178: Delete the unknown token tooltip, badge, ComboSelect, and disabled guard
- Lines 426-452: Delete the `unknown_reason_required` checkbox, onChange, disabled guard, and reason tooltip

#### 3.4 -- Presets (frontend + backend)

**File:** `tools/gui-react/src/features/studio/state/egPresetsClient.ts`
- Lines 71-72, 137-138: Delete `unknown_token` and `unknown_reason_required` from both preset objects

**File:** `src/features/studio/contracts/egPresets.js`
- Lines 134-135, 207-208: Delete from both preset objects

#### 3.5 -- Workbench data pipeline (helpers → types → columns)

**File:** `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- Line 117: Delete `unknownToken` mapping

**File:** `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- Line 17: Delete `unknownToken: string` from the row type

**File:** `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- Lines 240-246: Delete the `unknownToken` column definition block
- Line 396: Remove `'unknownToken'` from the `contract` preset array
- Line 445: Remove `{ id: 'unknownToken', label: 'Unk Token' }` from the filter config

#### 3.6 -- Behavior contracts

**File:** `tools/gui-react/src/features/studio/state/studioBehaviorContracts.ts`
- Lines 46, 48: Delete both entries from `STUDIO_DEFERRED_CONTRACT_LOCKED_FIELDS`

#### 3.7 -- Run GUI build + tests

**Gate:** GUI `tsc` build GREEN. All studio tests GREEN. No TypeScript errors. No orphaned imports.

---

### Phase 4: Test fixture cleanup + final verification

**Goal:** Remove the dead knob from all test fixture data and verify the full system is clean.

#### 4.1 -- Test fixture cleanup

Remove `unknown_token: 'unk'` and `unknown_reason_required: true` from fixture objects in:

| File | Lines |
|------|-------|
| `src/features/color-edition/tests/colorEditionCandidateGate.test.js` | 48, 56 |
| `src/features/color-edition/tests/colorEditionCandidateGateE2E.test.js` | 23, 64 |
| `src/features/publisher/candidate-gate/tests/submitCandidate.test.js` | 15, 22, 30, 36 |
| `src/features/publisher/tests/discoveryEnumIntegration.test.js` | 13 |

#### 4.2 -- Studio test cleanup

Remove retired-knob assertions from:

| File | Lines |
|------|-------|
| `tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js` | 88-92 |
| `tools/gui-react/src/features/studio/__tests__/studioBehaviorContracts.test.js` | 88, 90, 96, 99-101 |

#### 4.3 -- Delete Phase 1 characterization tests

The zero-divergence audit test from Phase 1 is a one-time proof artifact. Delete it after the retirement is complete — it has no ongoing value.

#### 4.4 -- Final verification

- Full backend test suite: `node --test` GREEN
- Full GUI build: `tsc` GREEN
- GUI test suite: GREEN
- Grep audit: zero hits for `unknown_token` or `unknown_reason_required` in source files (excluding this roadmap)
- Generated JSON: confirmed clean across all 3 categories

**Gate:** Zero references remain in source. Full suite GREEN. Retirement complete.

---

## Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|------------|----------|------------|
| A category field secretly uses a custom unknown token | Near zero | Medium | Phase 1 characterization test proves zero divergence across 301 fields |
| Test fixtures fail when knob is removed from sample data | Low | Low | Phase 4 systematically cleans every fixture; failures are immediate and obvious |
| Future need for per-field unknown tokens | Very low | Low | Re-add the knob if needed — the normalizer infrastructure (`UNK_TOKENS`, `absenceNormalizer`) stays intact and supports it |
| Orphaned TypeScript types referencing the knob | Low | Low | Phase 3.6 `tsc` build gate catches any dangling references |

---

## Execution Order

```
Phase 1: Characterization
  └─ Prove zero divergence + lock behavior
  └─ Gate: characterization GREEN, full suite GREEN

Phase 2: Runtime + Compiler + Docs
  └─ Hardcode 'unk' in validation + phase registry
  └─ Stop compiler from emitting both fields
  └─ Remove from capabilities + consumer gate
  └─ Update validator-pipeline.html docs
  └─ Recompile all categories
  └─ Gate: full suite GREEN, generated JSON clean

Phase 3: Studio UI + Presets
  └─ Remove constants, tooltips, UI controls
  └─ Clean presets (frontend + backend)
  └─ Remove workbench columns + types + helpers
  └─ Remove behavior contract entries
  └─ Gate: tsc GREEN, studio tests GREEN

Phase 4: Test Fixtures + Final
  └─ Clean all test fixtures
  └─ Delete characterization tests
  └─ Grep audit: zero remaining references
  └─ Gate: full suite GREEN, retirement complete
```

---

## Total Impact

- **Source files modified:** 25
- **Source files deleted:** 0
- **Generated files regenerated:** 6
- **Knob pairs removed from generated JSON:** ~301
- **Lines of dead config removed:** ~60+ across source
- **Behavioral risk:** Zero — runtime already hardcodes the values being removed
