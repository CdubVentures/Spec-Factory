# Plan 01: Audit Documentation & Current State Freeze

## Goal
Lock down the exact current state of every settings propagation path as a reference document. No code changes.

## Depends On
Nothing (first plan)

## Blocks
All other plans (reference document)

---

## Deliverable: Field Propagation Matrix

Create `00-AUDIT-CURRENT-STATE.md` containing a complete matrix of all 209 settings from `src/shared/settingsRegistry.js`.

### For Each Setting, Document

| Column | Description |
|--------|-------------|
| `key` | Registry key (e.g., `fetchConcurrency`) |
| `type` | Registry type (string, int, float, bool, enum, csv_enum) |
| `default` | Registry default value |
| `flags` | secret, readOnly, allowEmpty, defaultsOnly, routeOnly, tokenClamped |
| `cfgKey` | Config alias if different from key (e.g., `concurrency`) |
| `envVar` | Env var name read in configBuilder.js (e.g., `CONCURRENCY`) |
| `configBuilderLine` | Line number in configBuilder.js where this is parsed |
| `guiDomainType` | Whether it appears in runtimeSettingsDomainTypes.ts |
| `guiPayloadIncluded` | Whether it reaches buildIndexingRunStartPayload output |
| `guiSubPayloadBuilder` | Which sub-payload builder includes it (runtime, llm, learning, ocr, discovery, model, or NONE) |
| `launchPlanIncluded` | Whether processStartLaunchPlan.js converts it to an env var |
| `launchPlanEnvVar` | The env var name it gets in the child process |
| `launchPlanLine` | Line number in processStartLaunchPlan.js |
| `roundOverridden` | Whether roundConfigBuilder.js overrides it |
| `roundOverrideLine` | Line(s) in roundConfigBuilder.js where override happens |
| `classification` | One of: direct-launch, payload-only, save-only, dead, readOnly, defaultsOnly |
| `consumers` | List of file:line pairs where this setting is actually read at runtime |

### Classification Definitions

- **direct-launch (42)**: GUI sends in POST body → processStartLaunchPlan converts to env var → child reads env → value reaches child process
- **payload-only (93)**: GUI sends in POST body → processStartLaunchPlan DROPS it → child gets it only from stale user-settings.json
- **save-only (11)**: GUI autosaves to user-settings.json → child reads the JSON file → 1500ms stale risk
- **dead (3)**: Registry entry exists but no runtime consumer (fetchSchedulerFallbackWaitMs, runtimeTraceLlmRing, helperFilesRoot)
- **readOnly (2)**: awsRegion, s3Bucket — cannot be set via PUT route
- **defaultsOnly (3)**: discoveryEnabled, daemonGracefulShutdownTimeoutMs, runtimeAutoSaveEnabled — config-only, not in API routes

---

## Files to Read (Not Modify)

### Registry & Derivations
- `src/shared/settingsRegistry.js` — all 209 entries, extract key/type/default/flags
- `src/shared/settingsRegistryDerivations.js` — verify derivation coverage
- `src/shared/settingsDefaults.js` — verify defaults match registry
- `src/shared/settingsClampingRanges.js` — verify ranges match registry

### Config Builder (env var parsing)
- `src/core/config/configBuilder.js` — for each registry key, find the env var name and line number
- `src/core/config/configPostMerge.js` — document which keys are clamped/normalized
- `src/core/config/configOrchestrator.js` — verify wiring
- `src/core/config/settingsKeyMap.js` — document DUAL_KEY_PAIRS and EXPLICIT_ENV_KEY_OVERRIDES
- `src/core/config/settingsClassification.js` — document classification logic

### Process Start (launch plan)
- `src/features/indexing/api/builders/processStartLaunchPlan.js` — for each field, document which env var it maps to and which POST body fields are ignored
- `src/app/api/routes/infra/processRoutes.js` — verify POST body is fully forwarded

### User Settings Service
- `src/features/settings-authority/userSettingsService.js` — document which keys are persisted, how dual-key sync works
- `src/features/settings-authority/runtimeSettingsRoutePut.js` — document PUT contract
- `src/features/settings-authority/runtimeSettingsRouteGet.js` — document GET contract

### Config Facade
- `src/config.js` — document loadConfigWithUserSettings flow

### Round Config
- `src/runner/roundConfigBuilder.js` — document every round override with line numbers

### GUI Payload Chain
- `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomainTypes.ts` — all 443 fields
- `tools/gui-react/src/features/indexing/api/indexingRunStartPayload.ts` — all sub-payload field inclusions
- `tools/gui-react/src/features/indexing/api/indexingRunRuntimePayload.ts`
- `tools/gui-react/src/features/indexing/api/indexingRunLlmSettingsPayload.ts`
- `tools/gui-react/src/features/indexing/api/indexingRunLearningPayload.ts`
- `tools/gui-react/src/features/indexing/api/indexingRunOcrPolicyPayload.ts`
- `tools/gui-react/src/features/indexing/api/indexingRunDiscoveryPayload.ts`
- `tools/gui-react/src/features/indexing/api/indexingRunModelPayload.ts`

---

## Audit Sections to Include

### Section 1: Complete Field Propagation Matrix
209 rows × 17 columns as defined above.

### Section 2: Dead Knob Evidence
For each dead knob, include:
- grep results showing no runtime consumer
- The file:line where it IS defined
- The file:line where it IS parsed (but not used)

### Section 3: Round Override Inventory
Table of all ~30 settings overridden by roundConfigBuilder, with:
- Setting key
- Round 0 value (fast profile)
- Round 1 value
- Round 2+ value (thorough profile)
- Line numbers in roundConfigBuilder.js

### Section 4: Propagation Gap List
For each of the 12+ critical gaps (settings that the user edits but never reach the child):
- Setting key
- Where it exists in GUI
- Where it gets dropped
- What the child actually uses instead

### Section 5: Stale-Start Race Condition
- Step-by-step reproduction
- Timing analysis (1500ms debounce window)
- Which settings are affected (Path B + Path C = 104 settings)

### Section 6: Dual-Key Alias Inventory
- All cfgKey aliases
- All DUAL_KEY_PAIRS
- All EXPLICIT_ENV_KEY_OVERRIDES
- Legacy name mappings in GUI (searchProvider, phase2LlmModel, helperFilesRoot, etc.)

---

## Execution Steps

1. Read all files listed above
2. Build the propagation matrix row by row
3. Cross-reference each registry key against configBuilder, processStartLaunchPlan, and GUI payload builders
4. Identify and document every gap
5. Write the document to `docs/implementation/settings-store-rewrite/00-AUDIT-CURRENT-STATE.md`
6. Review for completeness — every registry key must appear in the matrix

## Estimated Effort
Read-only audit. ~2-3 hours of systematic tracing.

## Rollback
N/A — this plan produces only documentation.
