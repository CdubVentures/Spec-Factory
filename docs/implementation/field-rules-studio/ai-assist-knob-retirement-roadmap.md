# AI Assist Knob Retirement Roadmap

**Knobs being removed:** `ai_assist.mode`, `ai_assist.model_strategy`, `ai_assist.max_calls`, `ai_assist.max_tokens`

**Surviving ai_assist knob after retirement:**
```
ai_assist: {
  reasoning_note: <string>    // per-field extraction guidance sent to LLM prompt
}
```

**Why:** These per-field LLM control knobs are redundant with the centralized LLM Config system (`tools/gui-react/src/features/llm-config/`). The LLM Config manages model selection, fallback logic, reasoning enablement, timeouts, and token budgets per pipeline phase globally. Per-field mode/strategy/calls/tokens adds a second control surface that conflicts with and duplicates the global system. As LLM Config matures, all model routing decisions flow through it — the field-level overrides become noise.

`reasoning_note` (Extraction Guidance) stays because it's unique per-field knowledge injected into the LLM prompt — not a model-routing concern. It describes *what* to extract and *how*, not *which model* to use.

---

## Pre-flight: Confirm Redundancy (before any code changes)

Verify the core claim that LLM Config subsumes per-field AI Assist knobs:

- [ ] `src/field-rules/capabilities.json:159-178` — all four knobs are `"status": "live"` with consumers in `fieldBatching.js`, `runUntilComplete.js`, and `extractCandidatesLLM.js`. Confirm the LLM Config phase overrides now control these same routing decisions.
- [ ] `src/ingest/compileFieldRuleBuilder.js:741-745` — compiler always emits mode/strategy/calls/tokens but they're auto-derived defaults (mode from priority+difficulty, calls from effort). Confirm removal doesn't break any runtime consumer that doesn't have a LLM Config fallback.
- [ ] `src/ingest/compileUtils.js:118-119` — `REVIEW_AI_MODES` and `REVIEW_AI_MODEL_STRATEGIES` sets are used for normalization. Confirm no other consumer depends on these enums beyond the compile pipeline.

### Known cleanup opportunities during retirement

- **Dead derivation UI:** `KeyPrioritySection.tsx:290-317` — mode-to-model derivation logic (`modeToModel` map) and "Effective AI Configuration" summary are purely UI display code with no runtime effect.
- **Orphan numeric bounds:** `studioNumericKnobBounds.ts:4-5` — `aiMaxCalls` and `aiMaxTokens` bounds only used by AI Assist editors.

---

## Phase 1: Characterization Tests

Lock down current behavior before touching anything. All tests must be GREEN before Phase 2.

### 1A. Compiler output characterization (compileFieldRuleBuilder)

**File:** new test in `src/ingest/tests/`

Capture that compiled field rules currently emit the full ai_assist block:

- Compiled rule always has `ai_assist.mode` (string|null)
- Compiled rule always has `ai_assist.model_strategy` (string, default 'auto')
- Compiled rule always has `ai_assist.max_calls` (number|null)
- Compiled rule always has `ai_assist.max_tokens` (number|null)
- Compiled rule always has `ai_assist.reasoning_note` (string)
- After retirement: only `ai_assist.reasoning_note` survives

### 1B. Normalization characterization (compileMapNormalization)

**File:** new test in `src/ingest/tests/`

Capture that `normalizeReviewAiAssist()` currently normalizes all 5 fields:

- `mode` validated against `REVIEW_AI_MODES` set → null if invalid
- `model_strategy` validated against `REVIEW_AI_MODEL_STRATEGIES` → 'auto' if invalid
- `max_calls` clamped to 1-10 → null if 0
- `max_tokens` clamped to 256-65536 → null if 0
- `reasoning_note` normalized via `normalizeText()`
- After retirement: function reduces to `reasoning_note` normalization only

### 1C. EG preset output characterization

**File:** existing test at `src/features/studio/contracts/tests/egPresets.test.js`

Verify current preset shapes before removing knobs:

- Colors preset (`egPresets.test.js:107`): `ai_assist.mode === 'advisory'`
- Editions preset (`egPresets.test.js:194`): `ai_assist.mode === 'advisory'`
- Both have `model_strategy: 'auto'`, `max_calls: 1`, `max_tokens: 4096`
- Both have `reasoning_note` with content (this survives)

### 1D. Frontend normalizer characterization

**File:** existing test at `tools/gui-react/src/features/studio/state/__tests__/studioPriorityContracts.test.js`

Verify `normalizeAiAssistConfig()` currently handles all 5 fields:

- `studioPriorityContracts.test.js:156` — normalizes undefined → defaults
- `studioPriorityContracts.test.js:173` — normalizes partial input
- After retirement: function reduces to `reasoning_note` handling only

---

## Phase 2: Remove from Backend Schema & Compiler Pipeline

Work inside-out: schema → normalization utilities → compiler → consumer registry → capabilities.

### 2A. Zod schema

**File:** `src/features/studio/contracts/studioSchemas.js`
- **Line 19:** Delete `mode: z.string().nullable().optional(),`
- **Line 20:** Delete `model_strategy: z.string().optional(),`
- **Line 21:** Delete `max_calls: z.number().nullable().optional(),`
- **Line 22:** Delete `max_tokens: z.number().nullable().optional(),`
- Keep line 23: `reasoning_note: z.string().optional()`

### 2B. Normalization utilities

**File:** `src/ingest/compileUtils.js`
- **Line 118:** Delete `export const REVIEW_AI_MODES = new Set([...]);`
- **Line 119:** Delete `export const REVIEW_AI_MODEL_STRATEGIES = new Set([...]);`
- **Lines 135-148:** Simplify `normalizeReviewAiAssist()` — remove mode/strategy/calls/tokens normalization. Reduce to:
  ```js
  export function normalizeReviewAiAssist(value = {}) {
    const aiAssist = isObject(value) ? value : {};
    return {
      reasoning_note: normalizeText(aiAssist.reasoning_note || '')
    };
  }
  ```

### 2C. Field rule builder (compiler)

**File:** `src/ingest/compileFieldRuleBuilder.js`
- **Lines 741-747:** Simplify `nestedAiAssist` block. Remove mode/strategy/calls/tokens:
  - Before: builds 5-property object
  - After:
    ```js
    const aiAssistInput = isObject(rule.ai_assist) ? rule.ai_assist : {};
    const nestedAiAssist = {
      reasoning_note: normalizeText(aiAssistInput.reasoning_note || '')
    };
    ```

### 2D. Map normalization pipeline

**File:** `src/ingest/compileMapNormalization.js`

All 8 call sites of `normalizeReviewAiAssist()` (lines 152, 173, 217, 239, 261, 339, 368, 427, 450) need no change — they call the function which will now return only `{ reasoning_note }`. The callers spread/assign the result into `ai_assist`, so fewer keys means fewer keys written. Verify no caller destructures specific retired keys.

### 2E. Consumer badge registry

**File:** `src/field-rules/consumerBadgeRegistry.js`
- **Lines 268-290:** Delete 4 entries:
  - `ai_assist.mode` entry (lines 268-272)
  - `ai_assist.model_strategy` entry (lines 274-278)
  - `ai_assist.max_calls` entry (lines 280-284)
  - `ai_assist.max_tokens` entry (lines 286-290)
- Keep `ai_assist.reasoning_note` entry (lines 292-296)

### 2F. Consumer gate

**File:** `src/field-rules/consumerGate.js`
- **Line 43:** Delete `'ai_assist.mode': [['ai_assist', 'mode']],`
- **Line 44:** Delete `'ai_assist.model_strategy': [['ai_assist', 'model_strategy']],`
- **Line 45:** Delete `'ai_assist.max_tokens': [['ai_assist', 'max_tokens']],`
- Keep line 46: `'ai_assist.reasoning_note': [['ai_assist', 'reasoning_note']],`

**Note:** `ai_assist.max_calls` is NOT in consumerGate.js (only in badge registry). Verify no consumer gate references it.

### 2G. Capabilities registry

**File:** `src/field-rules/capabilities.json`
- **Lines 159-163:** Delete `ai_assist.mode` knob entry
- **Lines 164-168:** Delete `ai_assist.model_strategy` knob entry
- **Lines 169-173:** Delete `ai_assist.max_calls` knob entry
- **Lines 174-178:** Delete `ai_assist.max_tokens` knob entry
- Keep lines 179-183: `ai_assist.reasoning_note` knob entry

### 2H. EG presets (backend)

**File:** `src/features/studio/contracts/egPresets.js`
- **Lines 186-189:** Delete `mode`, `model_strategy`, `max_calls`, `max_tokens` from colors preset `ai_assist` block. Keep `reasoning_note` (line 190).
- **Lines 239-242:** Delete `mode`, `model_strategy`, `max_calls`, `max_tokens` from editions preset `ai_assist` block. Keep `reasoning_note` (line 243+).

---

## Phase 3: Remove from Frontend TypeScript Types & State

### 3A. Shared type definition

**File:** `tools/gui-react/src/types/studio.ts`
- **Lines 39-42:** Delete 4 properties from `AiAssistConfig` interface:
  - `mode?: string | null;`
  - `model_strategy?: string;`
  - `max_calls?: number | null;`
  - `max_tokens?: number | null;`
- Keep line 43: `reasoning_note?: string;`

### 3B. Frontend normalizer

**File:** `tools/gui-react/src/features/studio/state/studioPriority.ts`
- **Lines 198-240:** Simplify `normalizeAiAssistConfig()`. Remove mode/strategy/calls/tokens normalization. Reduce to:
  ```ts
  export function normalizeAiAssistConfig(
    value: unknown,
  ): Required<AiAssistConfig> {
    const input = value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
    return {
      reasoning_note: String(input.reasoning_note || ''),
    };
  }
  ```
- **Lines 242-260:** Delete `deriveAiModeFromPriority()` function entirely — it derives mode from priority, which is the exact knob being retired.

### 3C. Numeric knob bounds

**File:** `tools/gui-react/src/features/studio/state/studioNumericKnobBounds.ts`
- **Line 4:** Delete `aiMaxCalls: { min: 1, max: 10 },`
- **Line 5:** Delete `aiMaxTokens: { min: 256, max: 65536 },`

### 3D. Taxonomy registry

**File:** `tools/gui-react/src/registries/fieldRuleTaxonomy.ts`
- **Lines 34-39:** Delete `AI_MODE_REGISTRY` const
- **Lines 41-45:** Delete `AI_MODEL_STRATEGY_REGISTRY` const
- **Line 58:** Delete `export const AI_MODE_OPTIONS = ...`
- **Line 59:** Delete `export const AI_MODEL_STRATEGY_OPTIONS = ...`

### 3E. Shared component types

**File:** `tools/gui-react/src/features/studio/components/studioSharedTypes.ts`
- **Line 3:** Keep `AiAssistConfig` import — type still exists (narrower with only `reasoning_note`)
- **Line 13:** Keep `ai_assist?: AiAssistConfig;` on `DataListEntry` — now only carries `reasoning_note`
- No deletions needed — this file adapts automatically via the narrowed `AiAssistConfig` interface (Phase 3A)

### 3F. EG presets (frontend client)

**File:** `tools/gui-react/src/features/studio/state/egPresetsClient.ts`
- **Lines 116-119:** Delete `mode`, `model_strategy`, `max_calls`, `max_tokens` from colors preset `ai_assist` block. Keep `reasoning_note`.
- **Lines 168-171:** Delete `mode`, `model_strategy`, `max_calls`, `max_tokens` from editions preset `ai_assist` block. Keep `reasoning_note`.

---

## Phase 4: Remove from Frontend UI Components

### 4A. KeyPrioritySection — AiAssistSubsection (primary editor)

**File:** `tools/gui-react/src/features/studio/components/key-sections/KeyPrioritySection.tsx`

**Delete the entire `AiAssistSubsection` component** (lines 254-567) and replace with direct rendering of `ExtractionGuidanceSubsection`:

- **Lines 243-249:** Replace `<AiAssistSubsection ... />` with direct `<ExtractionGuidanceSubsection ... />` call (passing `reqLvl` and `diff` computed in the parent)
- **Lines 254-567:** Delete `AiAssistSubsectionProps` interface and `AiAssistSubsection` function entirely. This removes:
  - Mode derivation logic (lines 271-296)
  - Model resolution logic (lines 303-317)
  - AI Assist heading + 4-column grid (lines 319-485): Mode dropdown, Model Strategy dropdown, Max Calls input, Max Tokens input
  - "Effective AI Configuration" summary box (lines 487-555)
- **Keep lines 569-end:** `ExtractionGuidanceSubsection` stays intact — it reads `ai_assist.reasoning_note` only

Remove unused imports that were only needed by AiAssistSubsection:
- `STUDIO_TIPS.ai_mode`, `STUDIO_TIPS.ai_model_strategy`, `STUDIO_TIPS.ai_max_calls`, `STUDIO_TIPS.ai_max_tokens` — will be deleted from constants (Phase 4G)
- `STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls`, `.aiMaxTokens` — will be deleted (Phase 3C)

### 4B. EditableComponentSource — AI Assist section

**File:** `tools/gui-react/src/features/studio/components/EditableComponentSource.tsx`
- **Line 69:** Keep `normalizeAiAssistConfig(source.ai_assist)` call — it now returns `{ reasoning_note }` only
- **Lines 187-188:** Keep `updateAiAssist()` helper — still needed for reasoning_note updates
- **Lines 501-503:** Delete `explicitMode`, `strategy`, `explicitCalls` local vars
- **Lines ~504-537:** Delete Mode/Strategy/Calls/Tokens UI block (dropdowns + inputs + effective config summary)
- **Line 539:** Keep `explicitNote` var and extraction guidance textarea (lines ~540-630)
- Verify the component still renders the extraction guidance section correctly after mode/strategy/calls/tokens removal

### 4C. EditableDataList — AI Assist section

**File:** `tools/gui-react/src/features/studio/components/EditableDataList.tsx`
- **Line 56:** Keep `normalizeAiAssistConfig(entry.ai_assist)` call
- **Lines 63-64:** Keep `updateAiAssist()` helper
- **Lines 369-371:** Delete `explicitMode`, `strategy`, `explicitCalls` local vars
- **Lines ~372-406:** Delete Mode/Strategy/Calls/Tokens UI block
- **Line 407:** Keep `explicitNote` and extraction guidance textarea (lines ~408-630)

### 4D. MappingStudioTab — normalizeAiAssistConfig calls

**File:** `tools/gui-react/src/features/studio/components/MappingStudioTab.tsx`
- **Lines 23, 40, 52:** Keep imports and type references — `normalizeAiAssistConfig` and `AiAssistConfig` still exist (now narrower)
- **Lines 140, 168, 183, 200, 207, 228, 235, 357:** Keep all `normalizeAiAssistConfig()` calls — they now return `{ reasoning_note }` only. No changes needed here.

### 4E. Workbench columns

**File:** `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- **Lines 5-9:** Remove imports: `AI_MODE_OPTIONS`, `AI_MODEL_STRATEGY_OPTIONS` from `fieldRuleTaxonomy.ts`
- **Lines 12-13:** Delete `AI_MODE_OPTIONS` rebinding (`const AI_MODE_OPTIONS = ['', ..._AI_MODE_VALUES]`)
- **Lines 15-30:** Delete `aiModeBadge` record and `AiModeBadge` component entirely
- **Lines 358-404:** Delete 3 column definitions:
  - AI Mode inline editable column (lines 358-373)
  - AI Model Strategy inline editable column (lines 376-391)
  - AI Max Calls read-only column (lines 393-404)
- **Line 490:** Remove `'aiMode', 'aiMaxCalls'` from `contract` preset
- **Line 512:** Remove `'aiMode', 'aiModelStrategy', 'aiMaxCalls'` from `debug` preset
- **Lines 547-549:** Delete 3 entries from `ALL_COLUMN_IDS_WITH_LABELS`:
  - `{ id: 'aiMode', label: 'AI Mode' }`
  - `{ id: 'aiModelStrategy', label: 'AI Model' }`
  - `{ id: 'aiMaxCalls', label: 'AI Calls' }`

### 4F. WorkbenchDrawerContractTab — AI Assist section (drawer editor)

**File:** `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx`

This file has a **second full copy** of the AI Assist editor (separate from KeyPrioritySection):
- **Lines 302-304:** Delete `explicitMode`, `strategy`, `explicitCalls` local vars
- **Lines 332-390:** Delete Mode dropdown, Model Strategy dropdown, Max Calls input, Max Tokens input, and the effective config summary block
- **Lines 419+:** Keep `explicitNote` and extraction guidance textarea (reasoning_note editor)
- Remove STUDIO_TIPS references for `ai_mode`, `ai_model_strategy`, `ai_max_calls`, `ai_max_tokens`

### 4G. Workbench inline edit contracts

**File:** `tools/gui-react/src/features/studio/workbench/workbenchInlineEditContracts.ts`
- **Line 5:** Delete `aiMode: 'ai_assist.mode',`
- **Line 6:** Delete `aiModelStrategy: 'ai_assist.model_strategy',`
- **Line 7:** Delete `aiMaxCalls: 'ai_assist.max_calls',`

### 4H. Workbench types & helpers

**File:** `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- **Lines 33-35:** Delete 3 properties from `WorkbenchRow`:
  - `aiMode: string;`
  - `aiModelStrategy: string;`
  - `aiMaxCalls: number;`
- Keep line 36: `aiReasoningNote: string;`

**File:** `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- **Lines 133-135:** Delete 3 row accessors:
  - `aiMode: strN(r, 'ai_assist.mode'),`
  - `aiModelStrategy: strN(r, 'ai_assist.model_strategy', 'auto'),`
  - `aiMaxCalls: numN(r, 'ai_assist.max_calls', 0),`
- Keep line 136: `aiReasoningNote: strN(r, 'ai_assist.reasoning_note'),`

### 4I. Studio constants (tooltips)

**File:** `tools/gui-react/src/utils/studioConstants.ts`
- **Lines 139-159:** Delete 4 tooltip entries:
  - `ai_mode` (lines 139-144)
  - `ai_model_strategy` (lines 145-148)
  - `ai_max_calls` (lines 149-151)
  - `ai_max_tokens` (lines 152-159)
- Keep lines 160-166: `ai_reasoning_note` tooltip

---

## Phase 5: Remove from Rule Commands & State Helpers

### 5A. Rule commands

**File:** `tools/gui-react/src/features/studio/rules/ruleCommands.ts`
- **Line 106:** Delete `const explicitMode = String(aiAssist.mode || '');` — used by `deriveReasoningNote` to check if mode is 'off'. After retirement, this check is no longer relevant (reasoning_note can exist regardless).
- Verify lines 104-105 and 134 are still correct — `aiAssist` object access and `reasoning_note` write should still work with the reduced shape.

### 5B. Component sources state

**File:** `tools/gui-react/src/features/studio/state/studioComponentSources.ts`
- **Line 3:** Keep import of `normalizeAiAssistConfig`
- **Line 66:** Keep `ai_assist: normalizeAiAssistConfig(undefined)` — now returns `{ reasoning_note: '' }`

---

## Phase 6: Update Tests

### 6A. EG presets tests

**File:** `src/features/studio/contracts/tests/egPresets.test.js`
- **Line 107:** Delete `assert.equal(rule.ai_assist.mode, 'advisory');`
- **Line 194:** Delete `assert.equal(rule.ai_assist.mode, 'advisory');`
- Keep all `reasoning_note` assertions (lines 108-117, 124, 137, 147, 195-196)

### 6B. Studio priority contracts tests

**File:** `tools/gui-react/src/features/studio/state/__tests__/studioPriorityContracts.test.js`
- **Lines 150-173:** Update `normalizeAiAssistConfig` tests — assertions should only check `reasoning_note` output. Remove checks for mode/strategy/calls/tokens properties.

### 6C. Studio component source contracts tests

**File:** `tools/gui-react/src/features/studio/state/__tests__/studioComponentSourceContracts.test.js`
- **Line 63:** Update ai_assist fixture — remove mode/strategy/calls/tokens properties. Keep reasoning_note if present.

### 6D. Studio rule commands tests

**File:** `tools/gui-react/src/features/studio/rules/__tests__/studioRuleCommands.test.js`
- **Lines 70, 75, 87:** Update ai_assist fixtures and assertions — remove mode references, keep reasoning_note assertions.

### 6E. Dead config test (noDeadConfig)

**File:** `src/field-rules/tests/noDeadConfig.test.js`
- **Lines 121-137:** Update `'live AI assist knobs remain registered with consumer metadata'` test. The `expectedLiveAiKnobs` array (lines 123-128) currently asserts all 5 knobs are live. After retirement:
  - Remove `'ai_assist.mode'`, `'ai_assist.model_strategy'`, `'ai_assist.max_calls'`, `'ai_assist.max_tokens'` from the array
  - Keep `'ai_assist.reasoning_note'`

### 6F. Workbench system mapping coverage test

**File:** `tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js`
- **Line 79:** Remove `'ai_assist.max_calls'` from expected mapping entries (and any other retired ai_assist paths)

### 6G. Runtime metadata characterization test (KEEP — no changes needed)

**File:** `src/features/indexing/runtime/tests/idxRuntimeMetadataHasMeaningfulValue.test.js`
- **Line 35:** Documents `ai_assist.*` as aspirational/non-runtime. This test is useful characterization evidence confirming the knobs have no active runtime consumer. No changes needed — keep as-is.

### 6H. Prune Phase 1 characterization tests

After all retirement phases are green, delete the characterization tests created in Phase 1 — they served their purpose.

---

## Phase 7: Remove from Control Plane (field_studio_map.json)

These are the authored source files. The `ai_assist` block in each field's definition must be reduced to `reasoning_note` only.

### 7A. Keyboard

**File:** `category_authority/keyboard/_control_plane/field_studio_map.json`
- Search all `"ai_assist"` blocks → remove `"mode"`, `"model_strategy"`, `"max_calls"`, `"max_tokens"` keys
- Keep `"reasoning_note"` if present; delete `"ai_assist": {}` if empty after cleanup

### 7B. Mouse

**File:** `category_authority/mouse/_control_plane/field_studio_map.json`
- Same cleanup as keyboard
- Check for consumer override entries referencing `ai_assist.mode`, `ai_assist.model_strategy`, `ai_assist.max_calls`, `ai_assist.max_tokens` — delete those consumer entries

### 7C. Monitor

**File:** `category_authority/monitor/_control_plane/field_studio_map.json`
- Same cleanup as keyboard

**Script recommended** — many occurrences across 3 large JSON files. Use a scripted removal to avoid manual errors.

---

## Phase 8: Recompile & Regenerate

After all source changes, regenerate all category authority artifacts:

- [ ] `spec.js compile-rules keyboard`
- [ ] `spec.js compile-rules mouse`
- [ ] `spec.js compile-rules monitor`

Verify generated files no longer contain:
- `"mode"` key inside `ai_assist` blocks
- `"model_strategy"` key inside `ai_assist` blocks
- `"max_calls"` key inside `ai_assist` blocks
- `"max_tokens"` key inside `ai_assist` blocks

The `ai_assist` block in generated output should look like:
```json
"ai_assist": {
  "reasoning_note": "..."
}
```
or `"ai_assist": { "reasoning_note": "" }` for fields without explicit guidance.

**Files that will be regenerated:**
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/keyboard/_control_plane/field_studio_map.json` (if compile touches it)
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_control_plane/field_studio_map.json`
- `category_authority/monitor/_generated/field_rules.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`

---

## Phase 9: Rebuild Build Artifacts

### 9A. Backend bundle

- [ ] Rebuild `tools/dist/launcher.cjs` — contains stale copies of compiler code, consumer gate, normalization utilities

### 9B. Frontend bundle

- [ ] Rebuild `tools/gui-react/dist/` — served by `src/app/api/guiServer.js`
- Stale code: compiled AiAssistSubsection, AI Mode badge, inline column editors

---

## Phase 10: Cleanup & Docs

### Docs to update (remove ai_assist mode/strategy/calls/tokens references)

- [ ] `docs/features-html/validator-pipeline.html` — remove `ai_assist.mode`, `ai_assist.model_strategy`, `ai_assist.max_calls`, `ai_assist.max_tokens` from any knobs tables
- [ ] `docs/implementation/publisher/universal-validator-reference.html` — check for ai_assist knob references
- [ ] `docs/implementation/publisher/deterministic-checks-reference.html` — check for ai_assist references

### Final verification grep

- [ ] Grep entire codebase for ALL of these patterns — should be zero hits (excluding this roadmap doc and `reasoning_note` references):
  - `ai_assist.mode` (in source files — NOT in generated JSON being regenerated)
  - `ai_assist.model_strategy`
  - `ai_assist.max_calls`
  - `ai_assist.max_tokens`
  - `REVIEW_AI_MODES`
  - `REVIEW_AI_MODEL_STRATEGIES`
  - `AI_MODE_REGISTRY`
  - `AI_MODEL_STRATEGY_REGISTRY`
  - `AI_MODE_OPTIONS` (should be zero after taxonomy cleanup)
  - `AI_MODEL_STRATEGY_OPTIONS`
  - `aiMode` (camelCase in source — excluding aiReasoningNote)
  - `aiModelStrategy`
  - `aiMaxCalls`
  - `aiMaxTokens`
  - `AiModeBadge`
  - `deriveAiModeFromPriority`
- [ ] Verify `ai_assist.reasoning_note` references are intact and working
- [ ] Spot-check one category compile: verify `reasoning_note` still appears in generated output

---

## Full File Impact Manifest

### Backend Schema & Compiler (8 files)

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | `src/features/studio/contracts/studioSchemas.js` | 19-22 | Delete 4 schema properties |
| 2 | `src/ingest/compileUtils.js` | 118-119, 135-148 | Delete 2 sets, simplify normalizer |
| 3 | `src/ingest/compileFieldRuleBuilder.js` | 741-747 | Simplify ai_assist block |
| 4 | `src/ingest/compileMapNormalization.js` | 152, 173, 217, 239, 261, 339, 368, 427, 450 | No change needed (callers adapt via reduced return shape) |
| 5 | `src/field-rules/consumerBadgeRegistry.js` | 268-290 | Delete 4 entries |
| 6 | `src/field-rules/consumerGate.js` | 43-45 | Delete 3 path aliases |
| 7 | `src/field-rules/capabilities.json` | 159-178 | Delete 4 knob entries |
| 8 | `src/features/studio/contracts/egPresets.js` | 186-189, 239-242 | Delete 4 keys from 2 presets |

### Frontend Types & State (7 files)

| # | File | Lines | Action |
|---|------|-------|--------|
| 9 | `tools/gui-react/src/types/studio.ts` | 39-42 | Delete 4 interface properties |
| 10 | `tools/gui-react/src/features/studio/state/studioPriority.ts` | 198-260 | Simplify normalizer, delete deriveAiModeFromPriority |
| 11 | `tools/gui-react/src/features/studio/state/studioNumericKnobBounds.ts` | 4-5 | Delete 2 bounds |
| 12 | `tools/gui-react/src/registries/fieldRuleTaxonomy.ts` | 34-45, 58-59 | Delete 2 registries + 2 exports |
| 13 | `tools/gui-react/src/features/studio/state/egPresetsClient.ts` | 116-119, 168-171 | Delete 4 keys from 2 presets |
| 14 | `tools/gui-react/src/features/studio/rules/ruleCommands.ts` | 106 | Delete explicitMode var |
| 15 | `tools/gui-react/.../components/studioSharedTypes.ts` | 3, 13 | No change needed — adapts via narrowed AiAssistConfig |

### Frontend UI Components (9 files)

| # | File | Lines | Action |
|---|------|-------|--------|
| 16 | `tools/gui-react/.../key-sections/KeyPrioritySection.tsx` | 243-567 | Delete AiAssistSubsection, keep ExtractionGuidanceSubsection |
| 17 | `tools/gui-react/.../EditableComponentSource.tsx` | 501-537 | Delete mode/strategy/calls/tokens UI |
| 18 | `tools/gui-react/.../EditableDataList.tsx` | 369-406 | Delete mode/strategy/calls/tokens UI |
| 19 | `tools/gui-react/.../workbench/WorkbenchDrawerContractTab.tsx` | 302-390 | Delete mode/strategy/calls/tokens UI (2nd copy) |
| 20 | `tools/gui-react/.../workbench/workbenchInlineEditContracts.ts` | 5-7 | Delete 3 inline edit path mappings |
| 21 | `tools/gui-react/.../workbench/workbenchColumns.tsx` | 5-30, 358-404, 490, 512, 547-549 | Delete imports, badge, 3 columns, preset refs, labels |
| 22 | `tools/gui-react/.../workbench/workbenchTypes.ts` | 33-35 | Delete 3 props |
| 23 | `tools/gui-react/.../workbench/workbenchHelpers.ts` | 133-135 | Delete 3 row accessors |
| 24 | `tools/gui-react/.../studioConstants.ts` | 139-159 | Delete 4 tooltip entries |

### Tests (7 files)

| # | File | Lines | Action |
|---|------|-------|--------|
| 25 | `src/features/studio/contracts/tests/egPresets.test.js` | 107, 194 | Delete mode assertions |
| 26 | `tools/gui-react/.../state/__tests__/studioPriorityContracts.test.js` | 150-173 | Update normalizer tests |
| 27 | `tools/gui-react/.../state/__tests__/studioComponentSourceContracts.test.js` | 63 | Update fixture |
| 28 | `tools/gui-react/.../rules/__tests__/studioRuleCommands.test.js` | 70, 75, 87 | Update fixtures + assertions |
| 29 | `src/field-rules/tests/noDeadConfig.test.js` | 121-137 | Remove 4 retired knobs from expectedLiveAiKnobs array |
| 30 | `tools/gui-react/.../workbench/__tests__/systemMappingCoverage.test.js` | 79 | Remove retired ai_assist paths |
| 31 | `src/features/indexing/runtime/tests/idxRuntimeMetadataHasMeaningfulValue.test.js` | 35 | KEEP — characterization evidence, no changes needed |

### Control Plane (3 files — scripted)

| # | File | Action |
|---|------|--------|
| 32 | `category_authority/keyboard/_control_plane/field_studio_map.json` | Remove mode/strategy/calls/tokens from ai_assist blocks |
| 33 | `category_authority/mouse/_control_plane/field_studio_map.json` | Same + remove consumer overrides |
| 34 | `category_authority/monitor/_control_plane/field_studio_map.json` | Same |

### Build Artifacts (2 targets)

| # | Target | Action |
|---|--------|--------|
| 35 | `tools/dist/launcher.cjs` | Rebuild |
| 36 | `tools/gui-react/dist/` | Rebuild |

**Total: 31 source files + 3 control plane JSONs + 2 build targets = 36 touchpoints**

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Runtime consumer in `fieldBatching.js` reads `ai_assist.mode` for batch routing | LOW — capabilities.json consumer paths (`fieldBatching.js`, `runUntilComplete.js`) point at files that no longer exist in the current repo; `idxRuntimeMetadataHasMeaningfulValue.test.js:35` already documents ai_assist.* as aspirational/non-runtime | Pre-flight confirms no active runtime reader. The consumer metadata is stale. |
| `runUntilComplete.js` reads `ai_assist.max_calls` for budget enforcement | LOW — same as above, capabilities.json consumer path is stale | Pre-flight verifies. If somehow live, max_calls stays in compiler but is removed from UI only. |
| `extractCandidatesLLM.js` reads `ai_assist.max_tokens` for per-call token budget | LOW — same stale consumer path | LLM Config phase settings or `LLM_MAX_TOKENS` env var covers this. |
| EG presets hardcode `mode: 'advisory'` for color/edition fields | LOW — colors/editions use reasoning_note for guidance, mode only affected which model was chosen | LLM Config now chooses models globally. |
| Frontend `normalizeAiAssistConfig` called from 8+ locations | LOW — narrowing the return shape is backward-compatible | Callers spread the result; fewer keys = fewer writes, no breakage. |
| WorkbenchDrawerContractTab has 2nd copy of AI Assist editor (missed in first draft) | MEDIUM — easy to overlook during implementation | Phase 4F explicitly covers this file. Verify with grep after removal. |
| `workbenchInlineEditContracts.ts` maps 3 retired columns to dot-paths | LOW — inline edits will fail silently if column defs are removed but paths remain | Phase 4G explicitly removes the 3 path mappings. |
| `noDeadConfig.test.js` asserts all 5 knobs are live in capabilities.json | HIGH if missed — test will fail immediately after capabilities.json edit | Phase 6E explicitly updates the test's expected array. |
| Generated JSON shape changes break downstream consumers | MEDIUM — `launcher.cjs` and runtime tools read generated JSON | Phase 9 rebuilds both bundles after compile. |
| Control plane JSON edits (3 large files) introduce errors | MEDIUM — manual JSON editing at scale | Use scripted removal. |

---

## Execution Order Summary

```
Phase 1   →  Characterization tests (lock current compiler + normalizer + preset behavior)
Phase 2   →  Remove from backend (schema → utils → compiler → registry → gate → capabilities → presets)
          →  Run test suite GREEN
Phase 3   →  Remove from frontend types & state (types → normalizer → bounds → taxonomy → presets → ruleCommands)
          →  Run test suite GREEN
Phase 4   →  Remove from frontend UI (KeyPrioritySection → EditableComponentSource → EditableDataList → workbench → constants)
Phase 5   →  Remove from rule commands & state helpers
          →  Run test suite GREEN
Phase 6   →  Update tests (egPresets → priority contracts → component source contracts → rule commands tests)
          →  Run full test suite GREEN
Phase 7   →  Remove from control plane (field_studio_map.json × 3 categories — scripted)
Phase 8   →  Recompile all categories (regenerate field_rules.json)
          →  Run full test suite GREEN
Phase 9   →  Rebuild build artifacts (launcher.cjs + gui-react/dist/)
Phase 10  →  Cleanup docs + final verification grep + end-to-end spot checks
```
