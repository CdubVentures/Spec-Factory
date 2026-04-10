# List Items (min_items / max_items) Retirement Roadmap

**Knobs being removed:** `contract.list_rules.min_items` and `contract.list_rules.max_items`

**Surviving list_rules knobs after retirement:**
```
list_rules: {
  dedupe: <boolean>,           // deduplication (case-insensitive for strings)
  sort: 'none' | 'asc' | 'desc',  // list ordering
  item_union: <string>         // merge strategy across sources
}
```

**Why:** `min_items` is universally `0` across all 3 categories (keyboard, monitor, mouse) — no field ever requires a minimum item count. The validation check is a permanent no-op. `max_items` defaults to `100` on most fields, with a few at `12` or `50` — but no tech-spec list ever organically grows large enough to trigger truncation. The only realistic consumer would be LLM runaway protection, which is better handled as a generic pipeline safeguard than a per-field knob.

**Data proof:** Every compiled list field across all 3 categories has `min_items: 0`. No field has `min_items > 0`. `max_items` is `100` (default) on most fields, `50` on `editions`, and `12` on 5 keyboard enum-like lists (color, compatible_os, connection, keycap_profile, stabilizer_type). None of these ceilings have ever been reached in production.

---

## Pre-flight: Confirm Dead Weight (before any code changes)

Verify the core claims:

- [ ] `enforceListRules.js:48` — `if (listRules.min_items && result.length < listRules.min_items)` — since `min_items` is `0` on every compiled field, this branch is unreachable in production
- [ ] `runtimeGate.js:170` — `if (typeof listRules.min_items === 'number' && listRules.min_items > 0 && ...)` — same: `min_items` is always `0`, branch is dead
- [ ] `enforceListRules.js:42` — `if (listRules.max_items && result.length > listRules.max_items)` — verify no product has ever produced a list exceeding 12 items (the tightest ceiling). Check `.workspace/` run artifacts for any `max_items_truncated` repair records.
- [ ] `compileFieldRuleBuilder.js:604-605` — default template stamps `min_items: 0, max_items: 100` on every list field — confirms these are mechanical defaults, not authored constraints
- [ ] `categoryCompile.js:390-391` — same defaults during category compile

---

## Phase 1: Characterization Tests

Lock down current behavior before touching anything. All tests must be GREEN before Phase 2.

### 1A. enforceListRules characterization (publisher validation)

**File:** existing test at `src/features/publisher/validation/tests/enforceListRules.test.js`

Verify that dedupe + sort behavior is identical with and without min/max items present in the rules:

- `{ dedupe: true, sort: 'none' }` (no min/max keys) + list with dupes → deduped correctly
- `{ dedupe: true, sort: 'asc' }` (no min/max keys) + list → sorted correctly
- `{ dedupe: true, sort: 'none', min_items: 0, max_items: 100 }` + same list → identical result (proves keys are inert at default values)
- Empty list + `{ dedupe: true }` → empty list, no rejection (proves min_items: 0 is a no-op)

### 1B. runtimeGate characterization (engine)

**File:** existing test at `src/engine/tests/listRulesLimitContracts.test.js`

Verify that dedupe + sort enforcement in the engine is identical without min/max items:

- List field with `{ dedupe: true, sort: 'asc' }` (no min/max) → sorted + deduped, no changes array entries for truncation or rejection
- List field with `{ dedupe: true, sort: 'asc', min_items: 0, max_items: 100 }` → identical behavior

### 1C. validateField integration characterization

**File:** existing test at `src/features/publisher/validation/tests/validateField.test.js`

Verify the full pipeline handles list fields identically when list_rules omit min/max:

- List field with policy `open_prefer_known` + `list_rules: { dedupe: true, sort: 'none' }` → same enum + list handling
- No `min_items_violation` rejection produced when min/max keys are absent

---

## Phase 2: Remove min_items / max_items from Validation Pipeline

Work inside-out: enforcement checks → orchestrator → phase registry display.

### 2A. enforceListRules (core list enforcement)

**File:** `src/features/publisher/validation/checks/enforceListRules.js`
- **Line 2:** Update comment — remove "min/max items" from description
- **Line 3:** Update comment — change "Order: dedupe → sort → max_items → min_items check" to "Order: dedupe → sort"
- **Line 6:** Update JSDoc — remove `min_items?: number, max_items?: number` from parameter documentation
- **Lines 42-44:** Delete max_items truncation block:
  ```
  if (listRules.max_items && result.length > listRules.max_items) {
    repairs.push({ rule: 'max_items', truncatedFrom: result.length, to: listRules.max_items });
    result = result.slice(0, listRules.max_items);
  }
  ```
- **Lines 48-49:** Delete min_items rejection block:
  ```
  if (listRules.min_items && result.length < listRules.min_items) {
    repairs.push({ rule: 'min_items_violation', have: result.length, need: listRules.min_items, reject: true });
  }
  ```

### 2B. validateField orchestrator

**File:** `src/features/publisher/validation/validateField.js`
- **Line 147:** Delete the `min_items_violation` rejection push:
  ```
  // Remove the block that checks for min_items_violation in enforceListRules repairs
  // and pushes a rejection with reason_code: 'min_items_violation'
  ```
- The `enforceListRules()` call at line 144 stays — dedupe + sort still run

### 2C. Phase registry display

**File:** `src/features/publisher/validation/phaseRegistry.js`
- **Line 122:** Delete `Min items: ${lr.min_items}` from phase description string
- **Line 123:** Delete `Max items: ${lr.max_items}` from phase description string
- **Lines 165-170:** Delete badge registry entry for `contract.list_rules.max_items`
- **Lines 172-176:** Delete badge registry entry for `contract.list_rules.min_items`

### 2D. Run test suite — must be GREEN

---

## Phase 3: Remove min_items / max_items from Engine Runtime

### 3A. runtimeGate (Pass 1.5 enforcement)

**File:** `src/engine/runtimeGate.js`
- **Line 129:** Update comment — remove "min/max" from "Pass 1.5: list_rules enforcement — sort + min/max"
- **Lines 157-163:** Delete max_items truncation block:
  ```
  if (typeof listRules.max_items === 'number' && listRules.max_items > 0 && list.length > listRules.max_items) {
    list = list.slice(0, listRules.max_items);
    changes.push({ field, stage: 'list_rules', rule: 'max_items_truncated', before, after: list });
  }
  ```
- **Lines 170-178:** Delete min_items rejection block:
  ```
  if (typeof listRules.min_items === 'number' && listRules.min_items > 0 && list.length < listRules.min_items) {
    nextFields[field] = 'unk';
    failures.push({ field, stage: 'list_rules', reason_code: 'min_items_not_met', required: listRules.min_items, actual: list.length });
  }
  ```

### 3B. Run test suite — must be GREEN

---

## Phase 4: Remove min_items / max_items from Compiler Pipeline

### 4A. compileFieldRuleBuilder

**File:** `src/ingest/compileFieldRuleBuilder.js`
- **Line 596:** Delete `min_items: asInt(rule.list_rules.min_items, 0),`
- **Line 597:** Delete `max_items: asInt(rule.list_rules.max_items, 100),`
- **Line 604:** Delete `min_items: 0,` from default list_rules template
- **Line 605:** Delete `max_items: 100,` from default list_rules template
- **Line 859:** Delete `min_items: 0, max_items: 100` from fallback default object

### 4B. categoryCompile

**File:** `src/ingest/categoryCompile.js`
- **Line 390:** Delete `min_items: asInt(existingListRules.min_items, 0),`
- **Line 391:** Delete `max_items: asInt(existingListRules.max_items, 100),`

### 4C. Consumer badge registry

**File:** `src/field-rules/consumerBadgeRegistry.js`
- **Line 165 (approx):** Delete the `contract.list_rules.max_items` entry — "Truncates list values exceeding the declared maximum item count"
- **Line 172 (approx):** Delete the `contract.list_rules.min_items` entry — "Flags list values with fewer items than the declared minimum"

### 4D. Capabilities registry

**File:** `src/field-rules/capabilities.json`
- **Lines 46-50:** Delete `contract.list_rules.min_items` knob entry (status: live, consumer: runtimeGate)
- **Lines 51-55:** Delete `contract.list_rules.max_items` knob entry (status: live, consumer: runtimeGate)

### 4E. Run test suite — must be GREEN

---

## Phase 5: Remove min_items / max_items from EG Presets

### 5A. Backend presets

**File:** `src/features/studio/contracts/egPresets.js`
- **Line 133:** Remove `min_items: 0, max_items: 100` from the colors preset list_rules — becomes `{ dedupe: true, sort: 'none', item_union: 'set_union' }`
- **Line 211:** Remove `min_items: 0, max_items: 50` from the editions preset list_rules — becomes `{ dedupe: true, sort: 'none', item_union: 'set_union' }`

### 5B. Frontend presets

**File:** `tools/gui-react/src/features/studio/state/egPresetsClient.ts`
- **Line 70:** Remove `min_items: 0, max_items: 100` from colors client preset
- **Line 141:** Remove `min_items: 0, max_items: 50` from editions client preset

### 5C. Run test suite — must be GREEN

---

## Phase 6: Remove min_items / max_items from Studio UI

### 6A. KeyContractSection (key navigator)

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx`
- **Lines 326-345 (approx):** Delete the Min Items label + tooltip + number input block
- **Lines 355-374 (approx):** Delete the Max Items label + tooltip + number input block
- Keep dedupe, sort, and item_union controls intact

### 6B. WorkbenchDrawerContractTab (workbench drawer)

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx`
- **Lines 165-176 (approx):** Delete the Min Items label + tooltip + number input + onChange handler
- **Lines 178-189 (approx):** Delete the Max Items label + tooltip + number input + onChange handler
- Keep dedupe, sort, and item_union controls intact

### 6C. Studio constants (tooltips)

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- **Line 76:** Delete `list_rules_min_items` tooltip from STUDIO_TIPS
- **Line 77:** Delete `list_rules_max_items` tooltip from STUDIO_TIPS

### 6D. Verify TypeScript builds clean — no broken references

---

## Phase 7: Remove min_items / max_items from Test Infrastructure

### RETIRE (delete entirely)

### 7A. listRulesLimitContracts tests

**File:** `src/engine/tests/listRulesLimitContracts.test.js`
- **Delete entire file** — contains only min/max items tests (max_items truncation + min_items boundary enforcement)
- Dedupe and sort contracts live in their own files (`listRulesDedupeContracts.test.js`, `listRulesOrderingContracts.test.js`) and are unaffected

### 7B. listRules audit doc (min/max rows)

**File:** `src/engine/tests/listRules.audit.md`
- **Lines 27-30:** Delete the 4 min/max audit rows:
  - `list_rules max_items: truncates list and records change`
  - `list_rules min_items: violation sets field to unk with failure`
  - `list_rules min_items: exactly min_items passes`
  - `list_rules min_items: after dedupe - duplicates collapse below minimum`
- Keep all dedupe / sort / ordering audit rows intact

### COLLAPSE / REWRITE (remove min/max from fixtures, keep remaining tests)

### 7C. enforceListRules tests

**File:** `src/features/publisher/validation/tests/enforceListRules.test.js`
- **Lines 53-71:** Delete max_items test cases (truncation when over limit, no-op when under)
- **Lines 73-93:** Delete min_items test cases (rejection when below, no-op when 0, no flag with empty array)
- **Lines 95-100 (approx):** Clean combined test that uses `{ max_items: 2 }` — remove max_items from fixture
- Keep dedupe and sort test cases intact

### 7D. listRulesBoundaryContracts tests

**File:** `src/engine/tests/listRulesBoundaryContracts.test.js`
- Verify fixtures — if any list_rules objects carry `min_items`/`max_items` keys, strip them
- The sequencing contract tests (dedupe → sort pipeline) are valid and should remain

### 7E. listRulesHarness fixtures

**File:** `src/engine/tests/helpers/listRulesHarness.js`
- **Line 70:** Remove `min_items: 0, max_items: 100` from fixture list_rules
- **Line 81:** Remove `min_items: 0, max_items: 5` from fixture list_rules
- **Line 92:** Remove `min_items: 2, max_items: 10` from fixture list_rules
- **Line 103:** Remove `min_items: 0, max_items: 100` from fixture list_rules

### 7F. validateField test fixtures

**File:** `src/features/publisher/validation/tests/validateField.test.js`
- **Line 167:** Remove `max_items: 100, min_items: 0` from fixture list_rules

### 7G. colorEdition test fixtures

**File:** `src/features/color-edition/tests/colorEditionCandidateGate.test.js`
- **Line 49:** Remove `max_items: 100, min_items: 0` from fixture list_rules

**File:** `src/features/color-edition/tests/colorEditionCandidateGateE2E.test.js`
- **Line 24:** Remove `max_items: 100, min_items: 0` from fixture list_rules

### 7H. submitCandidate test fixtures

**File:** `src/features/publisher/candidate-gate/tests/submitCandidate.test.js`
- **Line 23:** Remove `max_items: 100, min_items: 0` from fixture list_rules

### 7I. deriveFailureValues (test helper)

**File:** `src/tests/deriveFailureValues.js`
- **Lines 102-103:** Delete min_items_violation derivation block:
  ```
  if (shape === 'list' && listRules?.min_items && listRules.min_items > 0) { ... }
  ```
- **Lines 189-193:** Delete max_items repair derivation block:
  ```
  if (shape === 'list' && listRules?.max_items) { ... }
  ```

### 7J. fieldContractTestRunner (test helper)

**File:** `src/tests/fieldContractTestRunner.js`
- **Line 203:** Delete `if (c.list_rules?.max_items)` knob entry
- **Line 204:** Delete `if (c.list_rules?.min_items && c.list_rules.min_items > 0)` knob entry with `min_items_violation` code

### KEEP (no changes needed)

- `src/engine/tests/listRulesDedupeContracts.test.js` — tests only dedupe, no min/max references
- `src/engine/tests/listRulesOrderingContracts.test.js` — tests only sort ordering, no min/max references
- `src/features/studio/contracts/tests/egPresets.test.js` — tests EG preset shapes, will pass after Phase 5 removes min/max from presets

### 7K. Run full test suite — must be GREEN

---

## Phase 8: Recompile & Regenerate

After all source changes, regenerate all category authority artifacts:

- [ ] `spec.js compile-rules keyboard`
- [ ] `spec.js compile-rules mouse`
- [ ] `spec.js compile-rules monitor`

Verify generated files no longer contain `min_items` or `max_items` in list_rules blocks.

**Files that will be regenerated:**
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/keyboard/_generated/cross_validation_rules.json`
- `category_authority/keyboard/_control_plane/field_studio_map.json`
- `category_authority/monitor/_generated/field_rules.json`
- `category_authority/monitor/_generated/cross_validation_rules.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_generated/cross_validation_rules.json`
- `category_authority/mouse/_control_plane/field_studio_map.json`
- `category_authority/_test_keyboard/_generated/field_rules.json` (test fixture — 7 list fields with min/max)

The list_rules block in generated output should look like:
```json
"list_rules": {
  "dedupe": true,
  "sort": "none",
  "item_union": "set_union"
}
```

---

## Phase 9: Rebuild Build Artifacts

### 9A. Backend bundle

- [ ] Rebuild `tools/dist/launcher.cjs` — contains stale copies of enforceListRules, runtimeGate, compileFieldRuleBuilder

### 9B. Frontend bundle

- [ ] Rebuild `tools/gui-react/dist/` — contains stale min/max items references in:
  - `tools/gui-react/dist/assets/studioConstants-wkbYjN4A.js` (2 tooltip strings)
  - `tools/gui-react/dist/assets/StudioPage-MYwJB33E.js` (12 references — form inputs + onChange handlers)
  - `tools/gui-react/dist/assets/useFieldRulesStore-CasC8WxT.js` (4 references — preset definitions)

---

## Phase 10: Cleanup Docs

### Docs to update (remove min_items / max_items references)

- [ ] `src/features/publisher/validation/README.md`
  - **Line 34:** Update the Field Rule Parameters table row — change "Dedupe, sort, min/max items" to "Dedupe, sort, item_union"
- [ ] `docs/features-html/validator-pipeline.html`
  - **Line 157:** Delete `contract.list_rules.max_items` row from knobs audit table
  - **Line 158:** Delete `contract.list_rules.min_items` row from knobs audit table
  - **Line 362:** Remove min_items/max_items from list_rules structure documentation
  - **Line 364:** Delete note about min_items producing `min_items_violation` rejection
  - **Line 461:** Delete `min_items_violation` from rejection code table
- [ ] `docs/implementation/publisher/universal-validator-reference.html`
  - **Line 122:** Update TOC — change "List Rules (dedupe, sort, min_items, max_items)" to "List Rules (dedupe, sort, item_union)"
  - **Lines 1063-1064:** Delete type annotations for `list_rules.min_items` and `list_rules.max_items`
  - **Lines 1086-1093:** Delete code snippets showing max_items truncation and min_items violation logic
  - **Lines 1104-1106:** Delete test case rows "Over max_items (100)" and "Below min_items"
  - **Line 1788:** Update empty list behavior documentation (remove min_items reference)
- [ ] `docs/implementation/publisher/deterministic-checks-reference.html`
  - **Lines 385-386:** Delete `contract.list_rules.min_items: 0` and `contract.list_rules.max_items: 100 / 50` references
  - **Lines 405, 411:** Delete `min_items` and `max_items` column headers
  - **Line 436:** Delete "Over max_items" test case
  - **Line 445:** Delete expected outcome referencing `min_items = 0`
  - **Line 790:** Update "List Rules (dedupe, max_items)" to "List Rules (dedupe, sort, item_union)"
- [ ] `docs/implementation/publisher/field-value-validation-architecture.html`
  - **Line 362:** Update "dedupe → sort → enforce min_items / max_items" to "dedupe → sort"
- [ ] `docs/implementation/publisher/field-test-integration.html`
  - Verify for any min_items/max_items references — remove if found

---

## Phase 11: Final Verification

- [ ] Run full test suite: `node --test`
- [ ] Grep entire codebase for ALL of these patterns — should be zero hits (excluding this roadmap doc and `node_modules/`):
  - `min_items` (in source files only — not generated JSON yet to be recompiled)
  - `max_items` (in source files only)
  - `min_items_violation`
  - `min_items_not_met`
  - `max_items_truncated`
  - `list_rules_min_items`
  - `list_rules_max_items`
- [ ] Verify `tools/gui-react` TypeScript compiles with no errors
- [ ] Visual check: open Studio UI, select a list-contracted field, confirm min/max inputs are gone, confirm dedupe + sort + item_union controls remain

---

## Full File Impact Manifest

### Validation pipeline — 3 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | `src/features/publisher/validation/checks/enforceListRules.js` | 2-3, 6, 42-44, 48-49 | Delete min/max logic, update comments |
| 2 | `src/features/publisher/validation/validateField.js` | 147 | Delete min_items_violation rejection |
| 3 | `src/features/publisher/validation/phaseRegistry.js` | 122-123, 165-176 | Delete display + badge entries |

### Engine runtime — 1 file

| # | File | Lines | Action |
|---|------|-------|--------|
| 4 | `src/engine/runtimeGate.js` | 129, 157-163, 170-178 | Delete min/max enforcement + update comment |

### Compiler pipeline — 2 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 5 | `src/ingest/compileFieldRuleBuilder.js` | 596-597, 604-605, 859 | Delete min/max from emission + defaults |
| 6 | `src/ingest/categoryCompile.js` | 390-391 | Delete min/max from category compile |

### Config registries — 2 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 7 | `src/field-rules/capabilities.json` | 46-55 | Delete 2 knob entries |
| 8 | `src/field-rules/consumerBadgeRegistry.js` | 165-176 | Delete 2 badge entries |

### EG presets — 2 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 10 | `src/features/studio/contracts/egPresets.js` | 133, 211 | Remove min/max from preset list_rules |
| 11 | `tools/gui-react/.../egPresetsClient.ts` | 70, 141 | Remove min/max from client presets |

### Frontend (React/TypeScript) — 3 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 12 | `tools/gui-react/.../KeyContractSection.tsx` | 326-374 | Delete min/max input blocks |
| 13 | `tools/gui-react/.../WorkbenchDrawerContractTab.tsx` | 165-189 | Delete min/max input blocks |
| 14 | `tools/gui-react/.../studioConstants.ts` | 76-77 | Delete 2 tooltip entries |

### Test files — 11 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 15 | `src/engine/tests/listRulesLimitContracts.test.js` | all | **DELETE entire file** |
| 16 | `src/engine/tests/listRules.audit.md` | 27-30 | Delete 4 min/max audit rows |
| 17 | `src/features/publisher/validation/tests/enforceListRules.test.js` | 53-100 | Delete min/max test cases |
| 18 | `src/engine/tests/listRulesBoundaryContracts.test.js` | (verify) | Strip min/max from fixtures if present |
| 19 | `src/engine/tests/helpers/listRulesHarness.js` | 70, 81, 92, 103 | Clean fixtures |
| 20 | `src/features/publisher/validation/tests/validateField.test.js` | 167 | Clean fixture |
| 21 | `src/features/color-edition/tests/colorEditionCandidateGate.test.js` | 49 | Clean fixture |
| 22 | `src/features/color-edition/tests/colorEditionCandidateGateE2E.test.js` | 24 | Clean fixture |
| 23 | `src/features/publisher/candidate-gate/tests/submitCandidate.test.js` | 23 | Clean fixture |
| 24 | `src/tests/deriveFailureValues.js` | 102-103, 189-193 | Delete derivation blocks |
| 25 | `src/tests/fieldContractTestRunner.js` | 203-204 | Delete knob entries |

### Docs — 6 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 26 | `src/features/publisher/validation/README.md` | 34 | Update list_rules description |
| 27 | `docs/features-html/validator-pipeline.html` | 157-158, 362, 364, 461 | Remove references |
| 28 | `docs/implementation/publisher/universal-validator-reference.html` | 122, 1063-1064, 1086-1093, 1104-1106, 1788 | Remove references |
| 29 | `docs/implementation/publisher/deterministic-checks-reference.html` | 385-386, 405, 411, 436, 445, 790 | Remove references |
| 30 | `docs/implementation/publisher/field-value-validation-architecture.html` | 362 | Update pipeline description |
| 31 | `docs/implementation/publisher/field-test-integration.html` | (verify) | Remove references if found |

### Build artifacts — 2 targets

| # | Target | Action |
|---|--------|--------|
| 27 | `tools/dist/launcher.cjs` | Rebuild |
| 28 | `tools/gui-react/dist/` | Rebuild |

### Generated / Control Plane (10 — regenerated via compile)

| # | File | Action |
|---|------|--------|
| 34 | `category_authority/keyboard/_generated/field_rules.json` | Regenerate |
| 35 | `category_authority/keyboard/_generated/cross_validation_rules.json` | Regenerate |
| 36 | `category_authority/keyboard/_control_plane/field_studio_map.json` | Regenerate |
| 37 | `category_authority/monitor/_generated/field_rules.json` | Regenerate |
| 38 | `category_authority/monitor/_generated/cross_validation_rules.json` | Regenerate |
| 39 | `category_authority/monitor/_control_plane/field_studio_map.json` | Regenerate |
| 40 | `category_authority/mouse/_generated/field_rules.json` | Regenerate |
| 41 | `category_authority/mouse/_generated/cross_validation_rules.json` | Regenerate |
| 42 | `category_authority/mouse/_control_plane/field_studio_map.json` | Regenerate |
| 43 | `category_authority/_test_keyboard/_generated/field_rules.json` | Regenerate (test fixture) |

**Total: 25 source files + 6 docs + 2 build targets + 10 generated artifacts = 43 touchpoints**

### Not in scope (confirmed)

- `src/field-rules/consumerGate.js` — generic list_rules plumbing, no min/max-specific path aliases
- `src/ingest/compileValidation.js` — generic list_rules plumbing without min/max-specific logic
- `tools/gui-react/src/features/studio/workbench/systemMapping.ts` — generic list_rules plumbing
- `src/features/indexing/runtime/idxRuntimeMetadata.js` — generic list_rules plumbing
- `tools/structured-metadata-sidecar/app.py` — unrelated `max_items_per_surface` (different domain)
- `tools/structured-metadata-sidecar/README.md` — same, unrelated
- `src/engine/tests/listRulesDedupeContracts.test.js` — tests only dedupe, no min/max
- `src/engine/tests/listRulesOrderingContracts.test.js` — tests only sort ordering, no min/max

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| A future field legitimately needs min_items > 0 | LOW — no tech-spec category has this need; if it arises, the knob can be re-added with a focused contract | Decision is reversible |
| LLM generates a runaway list (50+ items) with no max_items ceiling | LOW — LLM prompts constrain output format; lists are bounded by enum known-values and prompt structure, not item-count caps | Monitor first few runs post-retirement for list lengths |
| Test fixtures break because list_rules shape changes | MEDIUM — 6 test files have `min_items: 0, max_items: 100` in fixtures | Phase 7 explicitly cleans all fixtures |
| Generated JSON shape changes break downstream consumers | LOW — launcher.cjs consumes generated artifacts | Phase 9 rebuilds both bundles after recompile |
| egPresets client/backend out of sync | LOW — both updated in Phase 5 | Parallel changes in 5A/5B |

---

## Execution Order Summary

```
Phase 1   →  Characterization tests (lock current dedupe + sort behavior without min/max)
Phase 2   →  Remove from validation pipeline (enforceListRules → validateField → phaseRegistry)
          →  Run test suite GREEN
Phase 3   →  Remove from engine runtime (runtimeGate Pass 1.5)
          →  Run test suite GREEN
Phase 4   →  Remove from compiler (compileFieldRuleBuilder → categoryCompile → badge registry → capabilities)
          →  Run test suite GREEN
Phase 5   →  Remove from EG presets (egPresets.js + egPresetsClient.ts)
          →  Run test suite GREEN
Phase 6   →  Remove from frontend UI (KeyContractSection → WorkbenchDrawer → studioConstants)
Phase 7   →  Remove from test infrastructure (11 files — retire + collapse/rewrite + fixture cleanup)
          →  Run full test suite GREEN
Phase 8   →  Recompile all categories (regenerate 10 files incl. _test_keyboard)
Phase 9   →  Rebuild build artifacts (launcher.cjs + gui-react/dist/ — 4 stale asset files)
Phase 10  →  Cleanup docs (6 files — README + HTML docs + verify)
Phase 11  →  Final verification grep + visual check
```
