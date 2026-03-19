# Plan 07: GUI Store Integration — Fix Stale-Start Race

## Goal
Fix the stale-start race condition. Simplify the entire GUI settings chain to derive from registry instead of hand-maintained field lists.

## Depends On
Plans 03 (enhanced registry), 05 (snapshot transport), 06 (child consumer)

## Blocks
Plan 10 (drift prevention)

---

## Sub-Plan 7A: Fix Stale-Start Race

### Problem
User edits setting → autosave debounces 1500ms → user clicks Start → 104 of 209 settings use stale values from user-settings.json.

### Fix
The POST body already contains the current in-memory editor state. The backend now writes it as a snapshot (Plan 05). So the stale-start race is eliminated by architecture — the child reads the snapshot, not user-settings.json.

### Files to Modify

**`tools/gui-react/src/features/indexing/api/indexingRunMutations.ts`**
- Line ~179: `startIndexLabMut.mutate()` already sends `runtimeSettingsPayload`
- Add: explicit save-flush before start OR document that snapshot transport makes this unnecessary
- The mutation already captures `runtimeSettingsPayload` at call time (in-memory, not persisted)
- No actual code change needed if snapshot transport is in place — just add a WHY comment

**`tools/gui-react/src/features/indexing/components/IndexingPage.tsx`**
- Line ~58: Currently rebuilds from last saved snapshot
- Change: Use current in-memory editor state as the launch source
- The runtime settings projection should reflect current editor state, not last-persisted state

---

## Sub-Plan 7B: Registry-Driven Payload Builder

### Problem
`indexingRunStartPayload.ts` (250 LOC) + 6 sub-payload builders (~300 LOC total) hand-pick fields.

### Fix
One function that iterates the registry.

### Files to Modify

**`tools/gui-react/src/features/indexing/api/indexingRunStartPayload.ts`**

Replace the entire file with:

```typescript
import { RUNTIME_SETTINGS_REGISTRY } from '../../../../shared/settingsRegistry';
// OR import from a JSON export of the registry

export function buildIndexingRunStartPayload(input: {
  requestedRunId: string;
  category: string;
  productId: string;
  runtimeSettingsPayload: RuntimeSettings;
  runControlPayload: Record<string, string | number | boolean>;
}): Record<string, string | number | boolean> {
  const { requestedRunId, category, productId, runtimeSettingsPayload, runControlPayload } = input;

  // Run control fields (not from registry)
  const payload: Record<string, string | number | boolean> = {
    requestedRunId,
    category,
    mode: 'indexlab',
    replaceRunning: true,
    productId,
    profile: 'standard',
  };

  // All registry settings — iterate, don't hand-pick
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.secret || entry.readOnly || entry.defaultsOnly || entry.deprecated) continue;
    const value = runtimeSettingsPayload[entry.key as keyof RuntimeSettings];
    if (value !== undefined && value !== null) {
      payload[entry.key] = value as string | number | boolean;
    }
  }

  // Run control overrides (category-specific, user-provided)
  Object.assign(payload, runControlPayload);

  return payload;
}
```

**`tools/gui-react/src/features/indexing/api/indexingRunStartParsedValues.ts`**
- Simplify: derive numeric parsing rules from registry min/max
- OR eliminate entirely — if the backend snapshot handler does its own clamping

### Files to Delete (after wiring confirmed)
- `indexingRunRuntimePayload.ts`
- `indexingRunLlmSettingsPayload.ts`
- `indexingRunLearningPayload.ts`
- `indexingRunOcrPolicyPayload.ts`
- `indexingRunDiscoveryPayload.ts`
- `indexingRunModelPayload.ts`

---

## Sub-Plan 7C: Registry-Driven Draft/Payload/Hydration

### Problem
~2,700 LOC of hand-maintained field-by-field code across 7 files.

### Fix
Import the registry (as JSON or JS module) and iterate it.

### Shared Registry Access
The registry lives in `src/shared/settingsRegistry.js` (backend JS). The GUI needs it in TypeScript. Options:
1. **JSON export**: Build step generates `settingsRegistry.json` from the JS module
2. **Shared package**: Move registry to a shared location importable by both
3. **API endpoint**: GUI fetches registry at boot (adds latency)
4. **Copy**: Duplicate as TS (bad — defeats SSOT purpose)

**Recommended**: Option 1 — JSON export. Add a build step that runs `node -e "import('./src/shared/settingsRegistry.js').then(m => console.log(JSON.stringify(m.RUNTIME_SETTINGS_REGISTRY)))"` and writes to `tools/gui-react/src/stores/settingsRegistry.generated.json`.

### Files to Modify

**`tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftPayload.ts`** (620 LOC → ~100 LOC)
- Replace per-field mapping with registry iteration
- For each entry: read value from draft, apply type-appropriate bounds from registry min/max

**`tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts`** (527 LOC → ~80 LOC)
- Replace per-field serialization with registry iteration

**`tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalizer.ts`** (687 LOC → ~120 LOC)
- Replace per-field normalization with registry-driven type coercion
- Remove all legacy alias handling

**`tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsHydration.ts`** (444 LOC → ~80 LOC)
- Replace per-field binding creation with registry-driven bindings

**`tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomainTypes.ts`** (444 LOC → ~50 LOC)
- Generate types from registry instead of manual definitions
- OR use a generic `Record<string, string | number | boolean>` with registry-derived validation

**`tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftContracts.ts`**
- Align contracts with registry-derived shapes

**`tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsEditorAdapter.ts`**
- Simplify hydration to use registry-derived bindings

**`tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthorityHooks.ts`**
- Autosave still works — no change to save behavior
- Add WHY comment: start-launch no longer depends on save completing

---

## Sub-Plan 7D: LLM Panel Alignment

**`tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`**
- Ensure LLM settings (llmModelPlan, llmModelReasoning, llmPhaseOverridesJson, etc.) flow through the same registry-derived path
- No special-case handling for LLM settings

**`tools/gui-react/src/features/llm-config/state/llmPhaseOverridesBridge.ts`**
- Phase override bridge should derive from registry instead of ad-hoc wiring
- The bridge reads/writes llmPhaseOverridesJson which is a standard registry entry

---

## Sub-Plan 7E: Run-Start Path Cleanup

**`tools/gui-react/src/features/indexing/state/indexingRuntimeSettingsProjection.ts`**
- Align with snapshot-first model — projection should reflect current editor state

**`tools/gui-react/src/features/indexing/selectors/indexingRunControlSelectors.ts`**
- Selectors derive from unified store

---

## Sub-Plan 7F: Pipeline Settings UI Cleanup

**`tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowRunSetupSection.tsx`**
- Remove dead knob UI controls (fetchSchedulerFallbackWaitMs, runtimeTraceLlmRing)

**`tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowAutomationSection.tsx`**
- Remove helperFilesRoot control (use categoryAuthorityRoot only)

**`tools/gui-react/src/features/pipeline-settings/components/RuntimeSettingsFlowCard.tsx`**
- Align with simplified draft shape

---

## Test File to Create

### `tools/gui-react/src/features/indexing/api/__tests__/indexingRunStartPayloadCompleteness.test.ts`

```
Tests:
- C1: Every non-secret, non-readOnly, non-defaultsOnly, non-deprecated registry key appears in start payload output
- C2: No extra keys that aren't in the registry (except run control fields)
- C3: Secret keys (API keys) are excluded from start payload
- C4: ReadOnly keys (awsRegion, s3Bucket) are excluded from start payload
- C5: Deprecated keys are excluded from start payload
- C6: Registry with N entries produces payload with exactly N - (secret + readOnly + defaultsOnly + deprecated) settings keys
```

---

## Execution Steps

1. Set up registry JSON export build step
2. Rewrite indexingRunStartPayload.ts (registry-driven)
3. Delete 6 sub-payload builder files
4. Rewrite RuntimeFlowDraftPayload.ts (registry-driven)
5. Rewrite runtimeSettingsPayload.ts (registry-driven)
6. Rewrite RuntimeFlowDraftNormalizer.ts (registry-driven)
7. Rewrite runtimeSettingsHydration.ts (registry-driven)
8. Simplify runtimeSettingsDomainTypes.ts
9. Fix IndexingPage.tsx stale-start source
10. Update LLM panel files
11. Clean up UI sections (remove dead knob controls)
12. Write completeness tests
13. Run full test suite (backend + frontend)

## Estimated Effort
~8-10 hours. This is the largest plan — most LOC changes.

## Rollback
Revert each file individually. The registry-driven approach is a complete rewrite of each file, so partial rollback means reverting individual files.

## Risk Mitigation
- Start with indexingRunStartPayload.ts (most impactful, most testable)
- Verify with existing processStartLaunchPlan.test.js
- Then do draft/payload/hydration files one at a time
- Run tests after each file
