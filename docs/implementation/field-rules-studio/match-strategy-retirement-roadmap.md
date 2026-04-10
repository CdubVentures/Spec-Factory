# Match Strategy Retirement Roadmap

**Knobs being removed:** `enum.match.strategy` (+ flat alias `enum_match_strategy`) and `enum.match.fuzzy_threshold` (+ flat alias `enum_fuzzy_threshold`)

**NOT in scope:** `component.match.fuzzy_threshold` and other `component.match.*` knobs — those belong to the component resolver engine, a completely separate system.

**Surviving enum.match knobs after retirement:**
```
enum: {
  policy: 'closed' | 'open_prefer_known' | 'open',
  source: <string>,
  match: {
    format_hint: <string|null>          // custom regex for format check (Step 5)
  }
}
```

**Why:** `match_strategy` is 100% redundant with `enum.policy`. The validator's behavior is fully determined by policy:
- `closed` → exact match only. Unknowns rejected, LLM repair (P1) handles mapping. No alias resolution needed.
- `open_prefer_known` → alias resolution (case-insensitive + normalized). Unknowns accepted + persisted via `persistDiscoveredValue`. The entire point of this policy is lenient matching + vocabulary growth.
- `open` → everything passes at `checkEnum.js:115` (`policy === 'open'`). Match strategy is dead code for all 246 open fields.

**Data proof:** 301 compiled fields across 3 categories. Match strategy correlates 1:1 with policy:
- 4 `closed` + `exact` (colors, editions — EG-locked)
- 51 `open_prefer_known` + `alias`
- 239 `open` + `alias` (strategy ignored — open passes everything)
- 7 `open` + `exact` (anomalies — strategy equally ignored)

No `closed` + `alias` or `open_prefer_known` + `exact` combinations exist in any category.

`fuzzy_threshold` is dead code: collected by compiler, emitted in generated JSON, shown in UI dropdown — but zero runtime implementation in `checkEnum.js`. No branch handles `matchStrategy === 'fuzzy'`.

---

## Behavioral Change

**Before:** `checkEnum(value, policy, knownValues, matchStrategy)` — 4th parameter selects exact vs alias resolution.

**After:** `checkEnum(value, policy, knownValues)` — alias resolution is wired directly to policy:
- `closed` → exact match (no alias resolution)
- `open_prefer_known` → alias resolution (case-insensitive + normalized matching, self-healing repair)
- `open` → skip (already short-circuits at `policy === 'open'`)

This produces identical runtime results for all 301 fields across all 3 categories.

### Consumer gate impact

`isEnumConsistencyReviewEnabled()` currently checks `isConsumerEnabled(rule, 'enum.match.strategy', 'review')`. After retirement, this gate must check `enum.policy` instead (or `enum.match.format_hint` alone, since format_hint is the remaining actionable enum.match knob). The consistency review feature is gated by whether the enum has a review-enabled match config — with strategy gone, the gate should check `enum.match.format_hint` consumer status only.

---

## Pre-flight: Confirm Redundancy (before any code changes)

Verify the core claim that policy subsumes strategy:

- [ ] `checkEnum.js:50` — `useAlias = matchStrategy === 'alias'` — every field with `open_prefer_known` uses alias; every field with `closed` uses exact; every `open` field skips the alias branch entirely (line 115 short-circuits)
- [ ] `checkEnum.js:115` — `knownSet.has(v) || policy === 'open'` — when policy is open, the value is always accepted regardless of matchStrategy. All 246 open fields never reach the alias branch.
- [ ] `validateField.js:37` — `matchStrategy = fieldRule?.enum?.match?.strategy || 'exact'` — default is exact, which is correct for closed; open_prefer_known always has alias authored
- [ ] `compileFieldRuleBuilder.js:655` — compiler always emits strategy in sync with policy. No category init or preset creates a cross-policy/strategy combination that would change behavior.
- [ ] `studioRouteHelpers.js:33` — `isEnumConsistencyReviewEnabled()` gates on `enum.match.strategy` consumer — verify all EG presets that set `review: false` on strategy also set it on format_hint, so the gate can be simplified to format_hint-only
- [ ] `componentReviewHandlers.js:53` — duplicate of above — same gate function, same verification needed
- [ ] `engineComponentResolver.js:90` — reads `rule?.enum?.match?.fuzzy_threshold` as fallback for component threshold — verify this fallback was never the actual source for any field (component.match.fuzzy_threshold is always compiled, making this dead code)

### Known dead code to remove during retirement

- **Fuzzy UI:** `EnumConfigurator.tsx:190` has `<option value="fuzzy">fuzzy</option>` in dropdown — no runtime implementation exists
- **Fuzzy threshold UI:** `EnumConfigurator.tsx:193-208` — conditional render for `matchStrategy === 'fuzzy'` shows threshold slider for dead feature
- **Fuzzy threshold compiler:** `compileFieldRuleBuilder.js:658-661` — reads `enum_fuzzy_threshold`, clamps 0-1, writes to `enum.match.fuzzy_threshold` — value never consumed by validator
- **Fuzzy threshold engine fallback:** `engineComponentResolver.js:90` — reads `rule?.enum?.match?.fuzzy_threshold` as fallback for component matching — `component.match.fuzzy_threshold` is always compiled with a default of 0.75, making this fallback unreachable

---

## Phase 1: Characterization Tests

Lock down current behavior before touching anything. All tests must be GREEN before Phase 2.

### 1A. Enum check characterization (checkEnum)

**File:** existing test at `src/features/publisher/validation/tests/checkEnum.test.js`

Verify that behavior is identical when strategy is derived from policy vs passed explicitly:

- `closed` + value not in known set → `pass: false`, no alias attempt (current behavior with `exact`)
- `closed` + value in known set → `pass: true` (exact match, same either way)
- `open_prefer_known` + case mismatch → alias resolves, `repaired` set (current behavior with `alias`)
- `open_prefer_known` + truly unknown value → `pass: true`, `needsLlm: true` (soft rejection)
- `open` + any value → `pass: true` (strategy irrelevant — short-circuit at line 115)
- `open` + case mismatch → `pass: true`, NO repair (open doesn't need alias resolution)

### 1B. Validate field integration (validateField)

**File:** existing test at `src/features/publisher/validation/tests/validateField.test.js`

Verify the end-to-end pipeline produces identical results when match_strategy is removed from field rules:

- Field rule with `enum.policy: 'closed'` and no `enum.match.strategy` → exact behavior
- Field rule with `enum.policy: 'open_prefer_known'` and no `enum.match.strategy` → alias behavior
- Field rule with `enum.policy: 'open'` and no `enum.match.strategy` → pass-through

### 1C. Enum consistency gate characterization

**File:** new or existing test near `src/features/studio/api/tests/studioEnumConsistencyContracts.test.js`

Verify that `isEnumConsistencyReviewEnabled()` outcome is identical when checking format_hint consumer alone vs checking both strategy + format_hint:

- Rule with `consumers: { 'enum.match.strategy': { review: false }, 'enum.match.format_hint': { review: false } }` → disabled (current)
- Rule with `consumers: { 'enum.match.format_hint': { review: false } }` (no strategy key) → disabled (target behavior)
- Rule with `consumers: { 'enum.match.format_hint': { review: true } }` → enabled
- Rule with no consumers → enabled (default)

---

## Phase 2: Remove match_strategy from Runtime (Validator + Repair + API Gates)

Work inside-out: core check → orchestrator → repair prompt → phase registry → route gates.

### 2A. Core enum check

**File:** `src/features/publisher/validation/checks/checkEnum.js`
- **Line 29:** Update JSDoc — remove "Four match strategies" comment
- **Line 34:** Remove `@param {'exact'|'alias'} [matchStrategy='exact']` from JSDoc
- **Line 37:** Remove 4th parameter `matchStrategy` from function signature
- **Line 50:** Replace `const useAlias = matchStrategy === 'alias'` with `const useAlias = policy === 'open_prefer_known'`
- Keep `aliasResolve()` function and `normForCompare()` — they still do the work, just triggered by policy now

### 2B. Field validation orchestrator

**File:** `src/features/publisher/validation/validateField.js`
- **Line 37:** Delete `const matchStrategy = fieldRule?.enum?.match?.strategy || 'exact';`
- **Line 149:** Change `checkEnum(current, enumPolicy, enumValues, matchStrategy)` → `checkEnum(current, enumPolicy, enumValues)`

### 2C. Repair prompt builder

**File:** `src/features/publisher/repair-adapter/promptBuilder.js`
- **Line 91:** Delete `if (e.match?.strategy) enumParts.push(\`Match: ${e.match.strategy}\`);` from `buildFieldContractBlock()`
- **Line 199:** Delete `const matchStrategy = ctx.fieldRule?.enum?.match?.strategy || 'exact';`
- **Line 205:** Remove `(match: ${matchStrategy})` from prompt string — becomes `The field '${ctx.fieldKey}' has enum policy '${policyLabel}'.`

### 2D. Phase registry

**File:** `src/features/publisher/validation/phaseRegistry.js`
- **Line 146:** Update description: `'Validates the value against a known-values list. Policy determines matching behavior.'`
- **Line 147:** Update behaviorNote: `'closed: exact match, reject unknowns. open_prefer_known: alias resolution (case-insensitive + normalized), flag unknowns. open: all values pass.'`
- **Line 155:** Delete `const strategy = rule?.enum?.match?.strategy || 'exact';`
- **Line 157:** Change triggerDetail: `` `Policy: ${policy || '(none)'}, ${count} known values` ``

### 2E. Studio route helpers (enum consistency gate)

**File:** `src/features/studio/api/studioRouteHelpers.js`
- **Line 33:** Change `isEnumConsistencyReviewEnabled()` — remove the `enum.match.strategy` consumer check. Gate on `enum.match.format_hint` consumer only:
  - Before: `return isConsumerEnabled(rule, 'enum.match.strategy', 'review') && isConsumerEnabled(rule, 'enum.match.format_hint', 'review');`
  - After: `return isConsumerEnabled(rule, 'enum.match.format_hint', 'review');`

### 2F. Component review handlers (enum consistency gate duplicate)

**File:** `src/features/review/api/componentReviewHandlers.js`
- **Line 53:** Same change as 2E — remove `enum.match.strategy` from the consumer check:
  - Before: `return isConsumerEnabled(rule, 'enum.match.strategy', 'review') && isConsumerEnabled(rule, 'enum.match.format_hint', 'review');`
  - After: `return isConsumerEnabled(rule, 'enum.match.format_hint', 'review');`
- **Line 189:** Change error payload `field_path: 'enum.match.strategy'` → `field_path: 'enum.match.format_hint'` (the surviving gating knob)

### 2G. Engine component resolver (dead fallback cleanup)

**File:** `src/engine/engineComponentResolver.js`
- **Line 90:** Remove `?? rule?.enum?.match?.fuzzy_threshold` fallback — component.match.fuzzy_threshold is always compiled with default 0.75, so this enum fallback is dead code:
  - Before: `const rawThreshold = Number(matchConfig.fuzzy_threshold ?? rule?.enum?.match?.fuzzy_threshold);`
  - After: `const rawThreshold = Number(matchConfig.fuzzy_threshold);`

### 2H. Validation README

**File:** `src/features/publisher/validation/README.md`
- **Line 36:** Delete the `match_strategy` row from the knobs table

---

## Phase 3: Remove match_strategy from Test Infrastructure

### 3A. Test helper — deriveFailureValues

**File:** `src/tests/deriveFailureValues.js`
- **Line 38:** Delete `const matchStrategy = e?.match?.strategy || 'exact';`
- **Lines 210-220:** Rework alias repair derivation — instead of checking `matchStrategy === 'alias'`, check `enumPolicy === 'open_prefer_known'` (which is what triggers alias at runtime now)
- **Line 213:** Change `if (matchStrategy === 'alias' && ...)` → `if (enumPolicy === 'open_prefer_known' && ...)`

### 3B. Test helper — fieldContractTestRunner

**File:** `src/tests/fieldContractTestRunner.js`
- **Lines 223-225:** Delete the `enum.match.strategy` knob entry from the knobs array

### 3C. checkEnum tests

**File:** `src/features/publisher/validation/tests/checkEnum.test.js`
- **Lines 121-232:** Rewrite test describes. Currently organized by `match_strategy: alias` / `match_strategy: exact` — reorganize by **policy** instead:
  - `describe('checkEnum — closed policy (exact matching)')` — tests that were under `match_strategy: exact`
  - `describe('checkEnum — open_prefer_known policy (alias resolution)')` — tests that were under `match_strategy: alias`
  - `describe('checkEnum — open policy (pass-through)')` — new section for completeness
- Remove 4th argument from all `checkEnum()` calls — the function no longer takes it
- Tests now pass policy as 2nd argument to control behavior (which they already do)

### 3D. validateField tests

**File:** `src/features/publisher/validation/tests/validateField.test.js`
- **Line 201:** Delete comment `// match_strategy: alias integration`
- **Line 204:** Rename describe from `'validateField — enum match_strategy: alias'` to `'validateField — enum open_prefer_known alias resolution'`
- Remove `match: { strategy: 'alias' }` from field rule fixtures — policy alone should drive behavior
- Verify test still passes (alias resolution triggered by `open_prefer_known` policy)

### 3E. EG preset tests

**File:** `src/features/studio/contracts/tests/egPresets.test.js`
- **Line 91:** Delete `assert.equal(rule.enum.match.strategy, 'exact');` (colors preset)
- **Line 191:** Delete `assert.equal(rule.enum.match.strategy, 'exact');` (editions preset)

### 3F. Prompt builder tests

**File:** `src/features/publisher/repair-adapter/tests/promptBuilder.test.js`
- **Line 244-250:** Delete or rework the test `'P1 includes match strategy'`. The prompt no longer includes match strategy. Either:
  - Delete the test entirely, or
  - Rework to verify prompt includes the policy label instead

### 3G. Consumer badge registry tests

**File:** `src/field-rules/tests/consumerBadgeRegistry.test.js`
- **Line 203:** Remove `'enum.match.strategy'` from the expected paths list (it's in the `oldSeedReviewPaths` array passed to `FIELD_PARENT_MAP` assertion)

### 3H. Enum consistency contract tests

**File:** `src/features/studio/api/tests/studioEnumConsistencyContracts.test.js`
- **Line 32:** Remove `'enum.match.strategy': { review: false }` from fixture consumers — gate now checks format_hint only

### 3I. Review routes data change contract tests

**File:** `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`
- **Line 337:** Remove `'enum.match.strategy': { review: false }` from fixture consumers

---

## Phase 4: Remove match_strategy from Compiler Pipeline

### 4A. Field rule builder

**File:** `src/ingest/compileFieldRuleBuilder.js`
- **Line 654-656:** Delete the `match.strategy` property from `nestedEnum.match`:
  - Before: `match: { strategy: normalizeToken(rule.enum_match_strategy || enumMatch.strategy || 'exact') || 'exact' }`
  - After: `match: {}` (format_hint will be added below if present, so keep the object)
- **Lines 658-661:** Delete `fuzzy_threshold` collection entirely:
  ```
  const fuzzy = asNumber(rule.enum_fuzzy_threshold ?? enumMatch.fuzzy_threshold);
  if (fuzzy !== null) {
    nestedEnum.match.fuzzy_threshold = fuzzy;
  }
  ```

### 4B. Consumer badge registry

**File:** `src/field-rules/consumerBadgeRegistry.js`
- **Lines 228-232:** Delete the `enum.match.fuzzy_threshold` entry
- **Lines 234-239:** Delete the `enum.match.strategy` entry
- **Line 217:** Update the surviving `enum.policy` entry's `val.enum` description — remove "using policy + match strategy" → just "using policy":
  - Before: `'val.enum': { desc: 'Step 9 — Enum Check. Validates values against known-values list using policy + match strategy (exact or alias).' }`
  - After: `'val.enum': { desc: 'Step 9 — Enum Check. Validates values against known-values list using policy. closed: exact match. open_prefer_known: alias resolution.' }`

### 4C. Consumer gate

**File:** `src/field-rules/consumerGate.js`
- **Line 50:** Delete `'enum.match.strategy': [['enum', 'match', 'strategy']]`
- **Line 52:** Delete `'enum.match.fuzzy_threshold': [['enum', 'match', 'fuzzy_threshold'], ['enum_fuzzy_threshold']]`

### 4D. Capabilities registry

**File:** `src/field-rules/capabilities.json`
- **Lines 83-87:** Delete `enum.match.strategy` knob entry
- **Lines 88-91:** Delete `enum.match.fuzzy_threshold` knob entry

### 4E. EG presets (backend — both enum blocks AND consumer overrides)

**File:** `src/features/studio/contracts/egPresets.js`
- **Line 165:** Delete `match: { strategy: 'exact' }` from the colors preset's `enum` block
- **Line 224:** Delete `match: { strategy: 'exact' }` from the editions preset's `enum` block
- **Line 228:** Delete `'enum.match.strategy': { review: false }` from the editions preset's `consumers` block

---

## Phase 5: Remove match_strategy from Frontend (React/TypeScript)

### 5A. EnumConfigurator component (full scope)

**File:** `tools/gui-react/src/features/studio/components/EnumConfigurator.tsx`
- **Line 64:** Delete `const matchStrategy = strN(rule, 'enum.match.strategy', 'alias');`
- **Line 73:** Remove `'enum.match.strategy'` from `reviewToggleFields` array — becomes `['enum.match.format_hint'] as const`
- **Line 131:** Remove ` · Match: <strong>{matchStrategy}</strong>` from EG-managed display string
- **Lines 180-208:** Delete entire Match Strategy section:
  - Match Strategy label + tooltip (line 182)
  - `onUpdate('enum.match.strategy', ...)` handler (line 186)
  - Select dropdown with alias/exact/fuzzy options (lines 183-191)
  - Fuzzy threshold conditional block (lines 193-208)
- **Line 263:** Remove `{renderLabelSuffix?.('enum.match.strategy')}` from consistency mode label

### 5B. WorkbenchDrawerDepsTab (component type auto-setup)

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerDepsTab.tsx`
- **Line 83:** Delete `onUpdate('enum.match.strategy', 'alias');` — when user selects a component type, the auto-setup currently writes match_strategy. With retirement, policy alone drives behavior.

### 5C. KeyComponentsSection (component type auto-setup duplicate)

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyComponentsSection.tsx`
- **Lines 83-87:** Delete the `updateField(selectedKey, 'enum.match.strategy', 'alias');` call — same auto-setup as 5B

### 5D. Workbench types

**File:** `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- **Line 22:** Delete `matchStrategy: string;`

### 5E. Workbench helpers

**File:** `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- **Line 120:** Delete `matchStrategy: strN(r, 'enum.match.strategy', 'alias'),`

### 5F. Workbench columns

**File:** `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- **Line 312:** Delete `matchStrategy` column definition block (accessorKey + header + cell)
- **Line 505:** Remove `'matchStrategy'` from column group array
- **Line 550:** Remove `{ id: 'matchStrategy', label: 'Match Strategy' }` from filter list

### 5G. Studio constants (tooltips)

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- **Line 97:** Delete `match_strategy` tooltip entry from STUDIO_TIPS
- **Line 98:** Delete `fuzzy_threshold` tooltip entry from STUDIO_TIPS (enum-level — NOT `comp_match_fuzzy_threshold` which is component-level and stays)

---

## Phase 6: Remove match_strategy from Control Plane (field_studio_map.json)

These are the authored source files that the compiler reads. Both the nested `"strategy"` key inside `enum.match` blocks AND the consumer override entries referencing `"enum.match.strategy"` must be removed.

### 6A. Keyboard

**File:** `category_authority/keyboard/_control_plane/field_studio_map.json`
- 103 occurrences of `"strategy": "alias"` or `"strategy": "exact"` inside `enum.match` blocks
- Remove the `"strategy"` key from every `"match"` object
- Keep `"match"` object if it still contains `"format_hint"`; delete `"match": {}` if empty

### 6B. Mouse

**File:** `category_authority/mouse/_control_plane/field_studio_map.json`
- 80 occurrences of `"strategy"` in enum.match blocks
- Additionally, **lines 3926 and 11092** have consumer override entries `"enum.match.strategy": { ... }` — delete these consumer entries
- Same strategy-key cleanup as keyboard

### 6C. Monitor

**File:** `category_authority/monitor/_control_plane/field_studio_map.json`
- 113 occurrences
- Same cleanup as keyboard (check for consumer override entries too)

**Script recommended** — 296 total occurrences across 3 large JSON files. Use a scripted removal to avoid manual errors.

---

## Phase 7: Recompile & Regenerate

After all source changes, regenerate all category authority artifacts:

- [ ] `spec.js compile-rules keyboard`
- [ ] `spec.js compile-rules mouse`
- [ ] `spec.js compile-rules monitor`

Verify generated files no longer contain:
- `"strategy"` key inside `enum.match` blocks
- `"fuzzy_threshold"` key inside `enum.match` blocks
- `enum_match_strategy` (flat alias)
- `enum_fuzzy_threshold` (flat alias)

**Files that will be regenerated:**
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_generated/field_rules.runtime.json`
- `category_authority/monitor/_generated/field_rules.json`
- (Control plane maps only regenerated if compile touches them — Phase 6 hand-edits are the source)

The `enum.match` block in generated output should look like:
```json
"match": {
  "format_hint": "..."
}
```
or be omitted entirely if no format_hint exists.

---

## Phase 8: Rebuild Build Artifacts

### 8A. Backend bundle

- [ ] Rebuild `tools/dist/launcher.cjs` — contains stale copies of compiler code, consumer gate, and route helpers

**Stale references in launcher.cjs (will be fixed by rebuild):**
- Line 18824: `"enum.match.strategy"` path alias
- Line 18826: `"enum.match.fuzzy_threshold"` path alias
- Line 22984: `strategy: normalizeToken(...)` compiler emission
- Line 22987-22989: `fuzzy_threshold` compiler emission
- Line 425038: `isConsumerEnabled(rule, "enum.match.strategy", "review")` gate
- Line 463580: same gate (duplicate)
- Line 463697: `field_path: "enum.match.strategy"` error payload

### 8B. Frontend bundle

- [ ] Rebuild `tools/gui-react/dist/` — served by `src/app/api/guiServer.js:6`

**Stale references in dist/ (will be fixed by rebuild):**
- `tools/gui-react/dist/assets/StudioPage-BeoZzc4Y.js` — contains compiled EnumConfigurator with match strategy dropdown
- `tools/gui-react/dist/assets/TierPicker-KlHLJ3iU.js` — may contain stale references

---

## Phase 9: Cleanup Docs

### Docs to update (remove match_strategy / fuzzy_threshold references)

- [ ] `docs/features-html/validator-pipeline.html`
  - **Line 192:** Delete `enum.match.strategy` row from knobs audit table
  - **Line 388:** Remove `enum.match.strategy` from the "Reads" list
  - **Lines 655, 787:** Remove `match.strategy` from "Parameters used" lists
- [ ] `docs/implementation/publisher/deterministic-checks-reference.html`
  - **Line 553:** Remove `<span class="rule-source">enum.match.strategy: 'exact'</span>`
- [ ] `src/features/publisher/validation/README.md` — already handled in Phase 2H

### Docs NOT touched (false positive from prior version)

- `docs/03-architecture/data-model.md:296` — this documents the `match_type` DB column for component review, NOT the enum match strategy knob. Out of scope.

---

## Phase 10: Final Verification

- [ ] Run full test suite: `node --test`
- [ ] Grep entire codebase for ALL of these patterns — should be zero hits (excluding this roadmap doc, `component.match.*`, and `docs/03-architecture/data-model.md:match_type`):
  - `enum.match.strategy`
  - `enum_match_strategy`
  - `matchStrategy` (camelCase — in source files only, not generated)
  - `match_strategy` (underscore — in source files only)
  - `enum.match.fuzzy_threshold`
  - `enum_fuzzy_threshold`
  - `useAlias` (should be replaced with policy-derived logic)
- [ ] Verify no UI references to "Match Strategy" or "Fuzzy Threshold" in enum context remain
- [ ] Spot-check one product end-to-end: submit a candidate with case mismatch to an `open_prefer_known` field → verify alias resolution still fires
- [ ] Spot-check one product end-to-end: submit a candidate with case mismatch to a `closed` field → verify it rejects (exact match, P1 LLM repair)

---

## Full File Impact Manifest

### Runtime (validator + repair + API gates) — 8 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | `src/features/publisher/validation/checks/checkEnum.js` | 29, 34, 37, 50 | Remove param, derive useAlias from policy |
| 2 | `src/features/publisher/validation/validateField.js` | 37, 149 | Delete matchStrategy var + arg |
| 3 | `src/features/publisher/repair-adapter/promptBuilder.js` | 91, 199, 205 | Delete from prompt context |
| 4 | `src/features/publisher/validation/phaseRegistry.js` | 146-147, 155, 157 | Update description + triggerDetail |
| 5 | `src/features/studio/api/studioRouteHelpers.js` | 33 | Remove strategy from consumer gate |
| 6 | `src/features/review/api/componentReviewHandlers.js` | 53, 189 | Remove strategy from gate + error payload |
| 7 | `src/engine/engineComponentResolver.js` | 90 | Remove dead enum.match.fuzzy_threshold fallback |
| 8 | `src/features/publisher/validation/README.md` | 36 | Delete row |

### Test infrastructure — 9 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 9 | `src/tests/deriveFailureValues.js` | 38, 210-220 | Replace strategy check with policy check |
| 10 | `src/tests/fieldContractTestRunner.js` | 223-225 | Delete knob entry |
| 11 | `src/features/publisher/validation/tests/checkEnum.test.js` | 121-232 | Reorganize by policy, remove 4th arg |
| 12 | `src/features/publisher/validation/tests/validateField.test.js` | 201-204+ | Rename describe, clean fixtures |
| 13 | `src/features/studio/contracts/tests/egPresets.test.js` | 91, 191 | Delete strategy assertions |
| 14 | `src/features/publisher/repair-adapter/tests/promptBuilder.test.js` | 244-250 | Delete or rework "P1 includes match strategy" test |
| 15 | `src/field-rules/tests/consumerBadgeRegistry.test.js` | 203 | Remove from expected paths list |
| 16 | `src/features/studio/api/tests/studioEnumConsistencyContracts.test.js` | 32 | Remove from fixture consumers |
| 17 | `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js` | 337 | Remove from fixture consumers |

### Compiler pipeline — 4 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 18 | `src/ingest/compileFieldRuleBuilder.js` | 654-661 | Delete strategy + fuzzy_threshold emission |
| 19 | `src/field-rules/consumerBadgeRegistry.js` | 217, 228-239 | Delete 2 entries + update enum.policy description |
| 20 | `src/field-rules/consumerGate.js` | 50, 52 | Delete 2 path aliases |
| 21 | `src/field-rules/capabilities.json` | 83-91 | Delete 2 knob entries |

### Backend presets — 1 file

| # | File | Lines | Action |
|---|------|-------|--------|
| 22 | `src/features/studio/contracts/egPresets.js` | 165, 224, 228 | Delete match.strategy from enum blocks + consumer |

### Frontend (React/TypeScript) — 7 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 23 | `tools/gui-react/.../EnumConfigurator.tsx` | 64, 73, 131, 180-208, 263 | Delete matchStrategy var + reviewToggle + UI block + label suffix |
| 24 | `tools/gui-react/.../WorkbenchDrawerDepsTab.tsx` | 83 | Delete `onUpdate('enum.match.strategy', 'alias')` |
| 25 | `tools/gui-react/.../key-sections/KeyComponentsSection.tsx` | 83-87 | Delete `updateField(selectedKey, 'enum.match.strategy', 'alias')` |
| 26 | `tools/gui-react/.../workbench/workbenchTypes.ts` | 22 | Delete prop |
| 27 | `tools/gui-react/.../workbench/workbenchHelpers.ts` | 120 | Delete mapping |
| 28 | `tools/gui-react/.../workbench/workbenchColumns.tsx` | 312, 505, 550 | Delete column + refs |
| 29 | `tools/gui-react/.../studioConstants.ts` | 97, 98 | Delete 2 tooltip entries |

### Control plane (field_studio_map.json) — 3 files

| # | File | Occurrences | Action |
|---|------|-------------|--------|
| 30 | `category_authority/keyboard/_control_plane/field_studio_map.json` | 103 strategy keys | Remove strategy from enum.match |
| 31 | `category_authority/mouse/_control_plane/field_studio_map.json` | 80 strategy keys + 2 consumer overrides (lines 3926, 11092) | Remove strategy + consumer entries |
| 32 | `category_authority/monitor/_control_plane/field_studio_map.json` | 113 strategy keys | Remove strategy from enum.match |

### Docs — 2 files

| # | File | Lines | Action |
|---|------|-------|--------|
| 33 | `docs/features-html/validator-pipeline.html` | 192, 388, 655, 787 | Remove match_strategy references |
| 34 | `docs/implementation/publisher/deterministic-checks-reference.html` | 553 | Remove match_strategy reference |

### Build artifacts — 2 targets

| # | Target | Action |
|---|--------|--------|
| 35 | `tools/dist/launcher.cjs` | Rebuild (7 stale references) |
| 36 | `tools/gui-react/dist/` | Rebuild (stale EnumConfigurator + related) |

**Total: 34 source files + 3 control plane JSONs + 2 docs + 2 build targets = 41 touchpoints**

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| A closed field that somehow relied on alias resolution loses self-healing | NONE — 0 closed fields use alias in any category | Pre-flight audit confirms 1:1 correlation |
| An open_prefer_known field loses alias resolution | NONE — policy === 'open_prefer_known' becomes the alias trigger, identical behavior | Phase 1 characterization tests verify |
| Open fields that had exact strategy change behavior | NONE — open fields skip enum check entirely (line 115 short-circuit) | Strategy was dead code for all 246 open fields |
| Enum consistency review gate breaks after strategy consumer removal | LOW — gate switches from strategy+format_hint to format_hint-only | Phase 1C characterization test verifies identical gating. All EG presets that disable strategy also disable format_hint. |
| `format_hint` breaks when `match` object shape changes | LOW — format_hint is read from `enum.match.format_hint`, survives as-is | Verify format_hint path still works after match.strategy removal |
| `component.match.fuzzy_threshold` accidentally removed | MEDIUM — separate system, easy to confuse with `enum.match.fuzzy_threshold` | Scope is explicit: only `enum.match.*` strategy/fuzzy_threshold. Component match knobs are OUT OF SCOPE |
| Frontend auto-setup writes stale `enum.match.strategy` back into rules | HIGH if missed — two surfaces (WorkbenchDrawerDepsTab:83, KeyComponentsSection:85) will re-introduce the retired knob | Phase 5B and 5C explicitly cover these |
| Generated JSON shape changes break downstream consumers | LOW — `launcher.cjs` consumes generated artifacts | Phase 8 explicitly rebuilds both bundles |
| Control plane JSON edits (296+ occurrences across 3 files) introduce errors | MEDIUM — manual JSON editing at scale | Use scripted removal (find "strategy" key in enum.match blocks, delete) |
| Stale build artifacts served to GUI | MEDIUM — `tools/gui-react/dist/` is served by guiServer.js | Phase 8B explicitly rebuilds frontend dist |

---

## Execution Order Summary

```
Phase 1   →  Characterization tests (lock current behavior including consistency gate)
Phase 2   →  Remove from runtime (checkEnum → validateField → promptBuilder → phaseRegistry → route gates → engine fallback)
          →  Run test suite GREEN
Phase 3   →  Remove from test infra (9 test files)
          →  Run test suite GREEN
Phase 4   →  Remove from compiler (compileFieldRuleBuilder → badge registry → consumer gate → capabilities → EG presets)
          →  Run test suite GREEN
Phase 5   →  Remove from frontend (EnumConfigurator → DepsTab → KeyComponentsSection → workbench → constants)
Phase 6   →  Remove from control plane (field_studio_map.json × 3 categories — scripted)
Phase 7   →  Recompile all categories (regenerate field_rules.json + runtime.json)
          →  Run full test suite GREEN
Phase 8   →  Rebuild build artifacts (launcher.cjs + gui-react/dist/)
Phase 9   →  Cleanup docs (2 files)
Phase 10  →  Final verification grep (all patterns) + end-to-end spot checks
```
