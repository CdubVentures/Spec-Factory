# Evidence Knob Retirement Roadmap

**Knobs being removed:** `evidence_required` (+ nested `evidence.required`) and `conflict_policy` (+ nested `evidence.conflict_policy`)

**Surviving evidence knobs after retirement:**
```
evidence: {
  min_evidence_refs: <number>,              // hard gate: must have N distinct sources
  tier_preference: [tier1, tier2, tier3]    // soft signal: prefer these tiers during extraction
}
```

**Why:** `evidence_required` is redundant — `min_evidence_refs >= 1` already expresses the same intent.
`conflict_policy` is dead code (explicitly `"status": "deferred"` in capabilities.json) with a misleading UI facade.
381/381 compiled fields have `evidence_required: true`. 379/381 use `resolve_by_tier_else_unknown`; 2 use `preserve_all_candidates`.

---

## Pre-flight: Confirm Redundancy (before any code changes)

Verify the core claim that `min_evidence_refs > 0` subsumes `evidence_required`:

- [ ] `runtimeGate.js:241` — `rule?.evidence_required || minRefs > 0` — since `minRefs` is always >= 1 (compileFieldRuleBuilder.js:505), the `evidence_required` branch is unreachable
- [ ] `ruleAccessors.js:53-58` — `ruleEvidenceRequired()` returns `false` when missing; but no field ever has it missing because compiler.js:118 always sets it — circular redundancy
- [ ] `reviewGridHelpers.js:182-189` — `conflict_policy === 'preserve_all_candidates'` — only 2 fields use it (`click_latency_list`, `sensor_latency_list` in mouse runtime JSON); behavior is a review-hold flag, not real conflict resolution

### Known bugs to fix during retirement

- **Typo path:** `WorkbenchDrawerContractTab.tsx:420` and `KeyPrioritySection.tsx:618` read `evidence.evidence_required` (double-nested typo) — this silently returns undefined and falls back
- **Default mismatch:** review layer defaults to `resolve_by_tier` (`reviewGridHelpers.js:141`) while studio defaults to `resolve_by_tier_else_unknown` (`KeyEvidenceSection.tsx:129`, `WorkbenchDrawerSimpleTabs.tsx:139`) — inconsistent but irrelevant since neither value triggers behavior

---

## Phase 1: Characterization Tests

Lock down current behavior before touching anything. All tests must be GREEN before Phase 2.

### 1A. Evidence gate characterization (runtimeGate)

**File:** new test in `src/engine/tests/`

Capture that evidence enforcement works identically with and without `evidence_required` when `min_evidence_refs >= 1`:

- Field with `evidence_required: true, min_evidence_refs: 1` → audited (current behavior)
- Field with `evidence_required: false, min_evidence_refs: 1` → audited (because minRefs > 0)
- Field with `evidence_required: true, min_evidence_refs: 0` → audited (current behavior — this is the ONLY case where evidence_required adds value; verify no field ever has minRefs=0)
- Field with `min_evidence_refs: 1` and NO `evidence_required` key → audited (proves minRefs alone is sufficient)

### 1B. Conflict policy characterization (reviewGridHelpers)

**File:** new test in `src/features/review/domain/tests/`

Capture current `inferFlags` behavior for conflict_policy:

- `conflict_policy: 'resolve_by_tier_else_unknown'` + multiple distinct candidates → no flag (current)
- `conflict_policy: 'preserve_all_candidates'` + multiple distinct candidates → `conflict_policy_hold` flag (current — live on `click_latency_list` and `sensor_latency_list`)
- `conflict_policy: 'preserve_all_candidates'` + single candidate → no flag (current)
- Missing `conflict_policy` + multiple candidates → no flag (current)

### 1C. Compiler output characterization

**File:** new test in `src/field-rules/tests/`

Capture that compiled field rules currently emit both knobs:

- Compiled rule always has `evidence.required` (boolean)
- Compiled rule always has `evidence_required` (flat mirror)
- Compiled rule always has `evidence.conflict_policy` (string)
- All three are redundant with `min_evidence_refs` and fixed consensus logic

---

## Phase 2: Retire `evidence_required`

Order matters. Work inside-out: runtime → compilation → category init → UI → generated artifacts.

### 2A. Runtime engine (the only behavioral change)

**File:** `src/engine/runtimeGate.js`
- **Line 241:** Remove `rule?.evidence_required ||` from the condition
- Before: `(respectPerFieldEvidence && (rule?.evidence_required || minRefs > 0))`
- After: `(respectPerFieldEvidence && minRefs > 0)`
- **Risk:** NONE — `minRefs` is always >= 1 for every compiled field

**File:** `src/engine/ruleAccessors.js`
- **Lines 53-58:** Delete `ruleEvidenceRequired()` function entirely
- Search for all imports of `ruleEvidenceRequired` and remove them

### 2B. Compiler pipeline

**File:** `src/field-rules/compiler.js`
- **Line 13:** Remove import of `ruleEvidenceRequiredAccessor`
- **Line 107:** Delete `const evidenceRequired = ruleEvidenceRequiredAccessor(rule);`
- **Line 118:** Delete `rule.evidence_required = evidenceRequired;`
- **Line 134:** Remove `required: evidenceRequired` from nested evidence block

**File:** `src/field-rules/compilerArtifactBuilders.js`
- **Lines 280, 289:** Remove `evidence_required` from `auditFieldMetadata()` validation

**File:** `src/ingest/compileFieldRuleBuilder.js`
- **Lines 326-327:** Delete nested→flat sync for `evidence_required`
- **Line 504:** Delete `required: true` from evidence block template
- **Line 947:** Delete `evidence_required: nestedEvidence.required !== false`

**File:** `src/ingest/compileValidation.js`
- **Lines 151-155:** Delete `resolvedEvidenceRequired` derivation and any downstream usage

**File:** `src/ingest/compileFieldInference.js`
- **Lines 262-268:** Delete evidence.required inference and flat-form sync

### 2C. Category init templates

**File:** `src/field-rules/compilerCategoryInit.js`
- **Line 95:** Delete `evidence_required: true` from `starterFieldDefinition()`
- **Line 131:** Delete `evidence_required: ''` from first placeholder template
- **Line 145:** Delete `evidence_required: ''` from second placeholder template

### 2D. Consumer gate & registry

**File:** `src/field-rules/consumerBadgeRegistry.js`
- **Lines 269-273:** Delete the `evidence.required` entry from CONSUMER_BADGE_REGISTRY

**File:** `src/field-rules/consumerGate.js`
- **Line 53:** Delete `'evidence.required': [['evidence', 'required'], ['evidence_required']]`

**File:** `src/field-rules/capabilities.json`
- **Lines 98-102:** Delete the `evidence.required` knob entry

### 2E. Frontend (React/TypeScript)

**File:** `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- **Line 26:** Delete `evidenceRequired: boolean;`

**File:** `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- **Line 123:** Delete `evidenceRequired: boolN(r, 'evidence.required', ...)` row mapping

**File:** `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- **Lines 333-336:** Delete `evidenceRequired` column definition
- **Line 525:** Remove `'evidenceRequired'` from column group array
- **Line 568:** Remove `{ id: 'evidenceRequired', label: 'Evidence Req' }` filter

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerSimpleTabs.tsx`
- **Lines 101, 112-113:** Delete `evReq` derivation, checkbox input, and "Evidence Required" label

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx`
- **Line 420:** Delete `evidence.evidence_required` read (typo path — also fixes bug)

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyEvidenceSection.tsx`
- **Lines 83-89, 103-105:** Delete checkbox form control and tooltip for evidence.required

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyPrioritySection.tsx`
- **Lines 618-619:** Remove `evidence_required` / `evidence.evidence_required` read (also fixes typo bug)

**File:** `tools/gui-react/src/features/studio/rules/ruleCommands.ts`
- **Line 81:** Delete `if (path === 'evidence.required') rule.evidence_required = value;`

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- **Line 108:** Delete `evidence_required` tooltip from STUDIO_TIPS

### 2F. Tests

**DELETE entirely:**
- `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js`
- `src/engine/tests/runtimeGate.evidenceRequired.audit.md`
- `src/engine/tests/evidenceEnforcementDefault.audit.md`

**DELETE specific tests:**
- `src/engine/tests/runtimeGate.core.test.js` lines 111-123 (evidence_required undefined edge case)

**CLEAN fixtures (remove `evidence_required` key from fixture data):**
- `src/field-rules/tests/fieldRulesCompiler.test.js` line 304
- `src/field-rules/tests/listFieldsAndFieldReport.test.js` lines 43, 59, 75
- `src/engine/tests/helpers/runtimeGateHarness.js` lines 150, 162, 173 (and all fixture instances)

---

## Phase 3: Retire `conflict_policy`

### 3A. Review grid (the only runtime consumer)

**File:** `src/features/review/domain/reviewGridHelpers.js`
- **Line 141:** Delete `conflict_policy: String(evidence.conflict_policy || 'resolve_by_tier').trim()`
- **Line 155:** Remove `'conflict_policy_hold'` from REAL_FLAG_CODES set
- **Lines 182-189:** Delete the entire `preserve_all_candidates` flag inference block

### 3B. Compiler pipeline

**File:** `src/ingest/compileFieldRuleBuilder.js`
- **Line 507:** Delete `conflict_policy: 'resolve_by_tier_else_unknown'` from evidence template
- **Lines 750-752:** Delete normalization of `nestedEvidence.conflict_policy`

**File:** `src/field-rules/compilerArtifactBuilders.js`
- **Lines 287, 305, 322, 339:** Delete `conflict_policy` from all 4 preset templates

### 3C. Category init templates

**File:** `src/field-rules/compilerCategoryInit.js`
- Check for any `conflict_policy` references in starter templates (none found in current audit, but verify during implementation)

### 3D. Consumer gate & registry

**File:** `src/field-rules/consumerBadgeRegistry.js`
- **Lines 263-267:** Delete `evidence.conflict_policy` entry

**File:** `src/field-rules/consumerGate.js`
- **Line 55:** Delete `'evidence.conflict_policy': [['evidence', 'conflict_policy']]`

**File:** `src/field-rules/capabilities.json`
- **Lines 118-123:** Delete `evidence.conflict_policy` knob entry

### 3E. Backend presets

**File:** `src/features/studio/contracts/egPresets.js`
- **Lines 185, 243:** Delete `conflict_policy` from both preset evidence blocks

**File:** `tools/gui-react/src/features/studio/state/egPresetsClient.ts`
- **Lines 114, 169:** Delete `conflict_policy: 'resolve_by_tier_else_unknown'` from both client preset evidence blocks

### 3F. Frontend (React/TypeScript)

**File:** `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- **Line 29:** Delete `conflictPolicy: string;`

**File:** `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- **Line 130:** Delete `conflictPolicy: strN(r, 'evidence.conflict_policy', ...)` row mapping

**File:** `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- **Lines 355-358:** Delete `conflictPolicy` column definition
- **Line 525:** Remove `'conflictPolicy'` from column group
- **Line 535:** Remove from debug preset
- **Line 571:** Remove label mapping

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerSimpleTabs.tsx`
- **Lines 138-144:** Delete the entire "Conflict Policy" select dropdown block

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyEvidenceSection.tsx`
- **Lines 119-146:** Delete conflict policy select dropdown and tooltip

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- **Line 110:** Delete `conflict_policy` tooltip from STUDIO_TIPS

### 3G. Tests

**DELETE or UPDATE:**
- `src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js` lines 28, 34, 50 (remove conflict_policy from fixture and assertions)
- `src/field-rules/tests/consumerBadgeRegistry.test.js` line 204 (remove from expected entries)

**CLEAN fixtures:**
- `src/engine/tests/helpers/runtimeGateHarness.js` lines 287, 305, 322 (remove conflict_policy from evidence blocks)
- `src/ingest/tests/mouse.compile.field-overrides.test.js` line 112 (remove from fixture)

---

## Phase 4: Recompile & Regenerate

After all source changes, regenerate all category authority artifacts:

- [ ] `spec.js compile-rules mouse`
- [ ] `spec.js compile-rules keyboard`
- [ ] `spec.js compile-rules monitor`

Verify generated files no longer contain:
- `evidence_required` (flat key)
- `evidence.required` (nested key)
- `evidence.conflict_policy` (nested key)

**Files that will be regenerated (7):**
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_generated/field_rules.runtime.json`
- `category_authority/mouse/_control_plane/field_studio_map.json`
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/keyboard/_control_plane/field_studio_map.json`
- `category_authority/monitor/_generated/field_rules.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`

The evidence block in generated output should look like:
```json
"evidence": {
  "min_evidence_refs": 1,
  "tier_preference": ["tier1", "tier2", "tier3"],
  "evidence_tier_minimum": 3
}
```

---

## Phase 5: Cleanup & Docs

### Audit docs to delete
- [ ] `src/engine/tests/runtimeGate.evidenceRequired.audit.md`
- [ ] `src/engine/tests/evidenceEnforcementDefault.audit.md`

### Audit docs to review for stale cross-references
- [ ] `src/engine/tests/runtimeGate.minRefs.audit.md`

### Docs to update (remove evidence_required / conflict_policy references)
- [ ] `docs/implementation/publisher/universal-validator-reference.html` (lines 2501, 2513)
- [ ] `docs/features-html/validator-pipeline.html` (line 237 — remove conflict_policy from evidence.* description)
- [ ] `docs/implementation/publisher/field-test-integration.html` (line 272 — remove `preserve_all_candidates` row)
- [ ] `docs/implementation/field-rules-studio/contracts/field-studio-contract.mmd` (line 24 — remove `conflict_policy_hold` from flags)
- [ ] `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy.mmd` (line 24 — same)
- [ ] `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy-dual.mmd` (line 24 — same)
- [ ] `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy-right.mmd` (line 32 — remove `conflict_policy_hold` node)
- [ ] `docs/implementation/src-audit/src-audit.data.js` (line 525 — update if referencing retired test files)

### Final
- [ ] Update any README.md domain contracts that mention evidence_required or conflict_policy
- [ ] Prune Phase 1 characterization tests (they served their purpose; delete after retirement is verified green)

---

## Full File Impact Manifest (44 source + 7 generated)

### evidence_required

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | `src/engine/runtimeGate.js` | 241 | Edit condition |
| 2 | `src/engine/ruleAccessors.js` | 53-58 | Delete function |
| 3 | `src/field-rules/compiler.js` | 13, 107, 118, 134 | Delete import + normalization |
| 4 | `src/field-rules/compilerArtifactBuilders.js` | 280, 289 | Delete validation |
| 5 | `src/field-rules/compilerCategoryInit.js` | 95, 131, 145 | Delete from init templates |
| 6 | `src/field-rules/consumerBadgeRegistry.js` | 269-273 | Delete entry |
| 7 | `src/field-rules/consumerGate.js` | 53 | Delete path alias |
| 8 | `src/field-rules/capabilities.json` | 98-102 | Delete knob |
| 9 | `src/ingest/compileFieldRuleBuilder.js` | 326-327, 504, 947 | Delete sync + default |
| 10 | `src/ingest/compileValidation.js` | 151-155 | Delete derivation |
| 11 | `src/ingest/compileFieldInference.js` | 262-268 | Delete inference |
| 12 | `tools/gui-react/.../workbenchTypes.ts` | 26 | Delete prop |
| 13 | `tools/gui-react/.../workbenchHelpers.ts` | 123 | Delete mapping |
| 14 | `tools/gui-react/.../workbenchColumns.tsx` | 333-336, 525, 568 | Delete column + refs |
| 15 | `tools/gui-react/.../WorkbenchDrawerSimpleTabs.tsx` | 101, 112-113 | Delete checkbox |
| 16 | `tools/gui-react/.../WorkbenchDrawerContractTab.tsx` | 420 | Delete typo read (bug fix) |
| 17 | `tools/gui-react/.../KeyEvidenceSection.tsx` | 83-89, 103-105 | Delete form control |
| 18 | `tools/gui-react/.../KeyPrioritySection.tsx` | 618-619 | Delete typo read (bug fix) |
| 19 | `tools/gui-react/.../ruleCommands.ts` | 81 | Delete alias sync |
| 20 | `tools/gui-react/.../studioConstants.ts` | 108 | Delete tooltip |
| 21 | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | all | Delete file |
| 22 | `src/engine/tests/runtimeGate.core.test.js` | 111-123 | Delete test |
| 23 | `src/engine/tests/runtimeGate.evidenceRequired.audit.md` | all | Delete file |
| 24 | `src/engine/tests/evidenceEnforcementDefault.audit.md` | all | Delete file |
| 25 | `src/field-rules/tests/fieldRulesCompiler.test.js` | 304 | Clean fixture |
| 26 | `src/field-rules/tests/listFieldsAndFieldReport.test.js` | 43, 59, 75 | Clean fixtures |
| 27 | `src/engine/tests/helpers/runtimeGateHarness.js` | 150, 162, 173+ | Clean fixtures |

### conflict_policy

| # | File | Lines | Action |
|---|------|-------|--------|
| 28 | `src/features/review/domain/reviewGridHelpers.js` | 141, 155, 182-189 | Delete contract field + flag + inference |
| 29 | `src/ingest/compileFieldRuleBuilder.js` | 507, 750-752 | Delete default + normalization |
| 30 | `src/field-rules/compilerArtifactBuilders.js` | 287, 305, 322, 339 | Delete from presets |
| 31 | `src/field-rules/consumerBadgeRegistry.js` | 263-267 | Delete entry |
| 32 | `src/field-rules/consumerGate.js` | 55 | Delete path alias |
| 33 | `src/field-rules/capabilities.json` | 118-123 | Delete knob |
| 34 | `src/features/studio/contracts/egPresets.js` | 185, 243 | Delete from presets |
| 35 | `tools/gui-react/.../egPresetsClient.ts` | 114, 169 | Delete from client presets |
| 36 | `tools/gui-react/.../workbenchTypes.ts` | 29 | Delete prop |
| 37 | `tools/gui-react/.../workbenchHelpers.ts` | 130 | Delete mapping |
| 38 | `tools/gui-react/.../workbenchColumns.tsx` | 355-358, 525, 535, 571 | Delete column + refs |
| 39 | `tools/gui-react/.../WorkbenchDrawerSimpleTabs.tsx` | 138-144 | Delete dropdown |
| 40 | `tools/gui-react/.../KeyEvidenceSection.tsx` | 119-146 | Delete dropdown |
| 41 | `tools/gui-react/.../studioConstants.ts` | 110 | Delete tooltip |
| 42 | `src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js` | 28, 34, 50 | Clean fixture + assertions |
| 43 | `src/field-rules/tests/consumerBadgeRegistry.test.js` | 204 | Remove from expected |
| 44 | `src/engine/tests/helpers/runtimeGateHarness.js` | 287, 305, 322 | Clean fixtures |
| 45 | `src/ingest/tests/mouse.compile.field-overrides.test.js` | 112 | Clean fixture |

### Docs (8)

| # | File | Lines | Action |
|---|------|-------|--------|
| 46 | `docs/implementation/publisher/universal-validator-reference.html` | 2501, 2513 | Update |
| 47 | `docs/features-html/validator-pipeline.html` | 237 | Update |
| 48 | `docs/implementation/publisher/field-test-integration.html` | 272 | Update |
| 49 | `docs/implementation/field-rules-studio/contracts/field-studio-contract.mmd` | 24 | Remove flag |
| 50 | `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy.mmd` | 24 | Remove flag |
| 51 | `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy-dual.mmd` | 24 | Remove flag |
| 52 | `docs/implementation/field-rules-studio/contracts/field-studio-contract-hierarchy-right.mmd` | 32 | Remove node |
| 53 | `docs/implementation/src-audit/src-audit.data.js` | 525 | Update refs |

### Generated / Control Plane (7 — regenerated via compile)

| # | File | Action |
|---|------|--------|
| 54 | `category_authority/mouse/_generated/field_rules.json` | Regenerate |
| 55 | `category_authority/mouse/_generated/field_rules.runtime.json` | Regenerate |
| 56 | `category_authority/mouse/_control_plane/field_studio_map.json` | Regenerate |
| 57 | `category_authority/keyboard/_generated/field_rules.json` | Regenerate |
| 58 | `category_authority/keyboard/_control_plane/field_studio_map.json` | Regenerate |
| 59 | `category_authority/monitor/_generated/field_rules.json` | Regenerate |
| 60 | `category_authority/monitor/_control_plane/field_studio_map.json` | Regenerate |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Field with `min_evidence_refs: 0` loses evidence gate | LOW — no field has minRefs=0; compiler defaults to 1-2 | Phase 1 characterization test verifies |
| `conflict_policy_hold` flag disappears for `click_latency_list` / `sensor_latency_list` | LOW — 2 fields in mouse runtime.json use `preserve_all_candidates`; flag would no longer fire | Phase 1 characterization documents; decide if `below_min_evidence` already covers this |
| Generated JSON shape changes break downstream consumers | MEDIUM — any external tool reading field_rules.json | Regenerate + full test suite pass |
| `launcher.cjs` bundle contains stale defaults | LOW — bundled copy is rebuilt from source | Rebuild after changes |
| `egPresetsClient.ts` client presets out of sync with backend | LOW — both sides updated in same phase | Parallel changes in 3E |

---

## Execution Order Summary

```
Phase 1  →  Characterization tests (lock current behavior)
Phase 2  →  Remove evidence_required (runtime → compiler → init → UI → tests)
         →  Run full suite GREEN
Phase 3  →  Remove conflict_policy (review grid → compiler → presets → UI → tests)
         →  Run full suite GREEN
Phase 4  →  Recompile all categories (regenerate field_rules.json + runtime.json)
Phase 5  →  Cleanup docs (8 files), audit files, prune characterization tests
```

**Total: 53 source files + 7 generated artifacts = 60 touchpoints**
