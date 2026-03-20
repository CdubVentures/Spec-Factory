# Plan 11: Reusable Settings Audit Template

## Goal
Provide a repeatable method for auditing LLM settings, pipeline/runtime settings, storage settings, and all attached legacy/compatibility paths with full lineage coverage.

## Use This When
- A settings surface is suspected to be miswired
- A new settings store is being introduced or refactored
- Legacy aliases or retired knobs may still be live
- UI, API, launch, and runtime behavior need to be proven end to end

## Audit Standard
The audit is only complete when every setting key is traced across:
- UI surface
- value ownership
- store/state layer
- API transport
- backend handlers
- persistence
- config/default resolution
- child-process launch transport
- downstream runtime consumers
- data-change/invalidation
- tests/contracts
- docs
- legacy aliases and compatibility seams

---

## Step 1: Define Scope

### In Scope
- Canonical settings
- Aliases
- Retired knobs that still exist anywhere in source, tests, or docs
- Future-use settings that remain intentionally routed

### Out of Scope
- Generated build output
- `node_modules`
- cache folders
- screenshots and binary artifacts unless they document the architecture

### Required Output
- Full file inventory
- Active issue list
- Legacy-but-live list
- Compatibility-only list
- Validation evidence

---

## Step 2: Build The Setting Inventory

Start from the authoritative sources first:
- `src/shared/settingsRegistry.js`
- `src/shared/settingsRegistryDerivations.js`
- `src/shared/settingsDefaults.js`
- `src/shared/settingsDefaults.d.ts`
- `src/core/config/configBuilder.js`
- `src/core/config/configPostMerge.js`

For each key, capture:
- canonical key
- type
- default
- config key
- env key
- alias keys
- deprecated or compatibility status

Required result:
- one table row per canonical key
- one row per legacy alias still accepted or still behaviorally live

---

## Step 3: Build The File Inventory

Enumerate every file that touches settings behavior.

### File Roles
- owner: canonical value owner
- adapter: transforms between shapes
- transport: sends/receives payloads
- handler: validates or persists
- resolver: derives effective config
- consumer: changes runtime behavior
- invalidation: broadcasts or reloads
- test: locks behavior
- doc: encodes architecture or public contract
- legacy: old but still live or still referenced

### Minimum Search Targets
- `tools/gui-react/src/features/llm-config/`
- `tools/gui-react/src/features/pipeline-settings/`
- `tools/gui-react/src/pages/storage/`
- `tools/gui-react/src/pages/llm-settings/`
- `tools/gui-react/src/stores/`
- `src/features/settings/`
- `src/features/settings-authority/`
- `src/core/config/`
- `src/core/llm/`
- `src/shared/`
- `src/api/`
- `src/app/`
- `src/features/indexing/`
- `test/`
- `docs/`

### Recommended Search Terms
- `llmPolicy`
- `llm-settings`
- `runtimeSettings`
- `storageSettings`
- `settingsAuthority`
- `settingsDefaults`
- `settingsRegistry`
- `settingsUnloadGuard`
- `runtimeSettingsSnapshot`
- `processStartLaunchPlan`
- `llmMaxOutputTokens`
- `searchProvider`
- `helperFilesRoot`

---

## Step 4: Classify Ownership

For each settings area, answer these explicitly:

### LLM
- What is the canonical owner?
- Is the composite policy primary, or is it a facade over flat keys?
- Does any other store or local state mirror the same value?
- Can saving one LLM surface clear dirty state for non-LLM settings?

### Pipeline / Runtime
- Is the runtime store the direct owner, or only a write-through cache?
- Do editors write directly into the store or into local draft state first?
- Does the launch path read the same value source the UI edits?

### Storage
- Is storage on the same store architecture?
- Are secrets, clear-secret flags, and status flags owned in one place?
- Does unload autosave use the same persistence semantics as regular save?

### Legacy
- Is each legacy key:
  - accepted by API
  - persisted
  - resolved into effective config
  - consumed at runtime
  - surfaced in UI
  - enforced by tests
  - documented

If yes to any of the above, it is still live.

---

## Step 5: Trace Every Setting End To End

For each key, verify this chain:

1. UI entry point
2. UI state/store owner
3. payload builder
4. API route
5. backend handler
6. persistence layer
7. config resolver/default merge
8. launch transport
9. runtime consumer
10. reporting or summary surface
11. invalidation / data-change side effects
12. tests and docs

### Required Questions
- Can the key be edited?
- Can it be saved?
- Can it be lost on reload/unload?
- Can it be dropped before launch?
- Can an alias override it?
- Can a round override mutate it later?
- Does reporting show the effective value or just the raw global value?

---

## Step 6: Probe Live Behavior

Source inspection is not enough.

Run direct probes for:
- route method compatibility
- save and reload round-trip
- unload persistence behavior
- run-start payload composition
- snapshot creation
- child config load path

### Required Probe Types
- `GET` then `PUT` round-trip
- `POST`/`PUT` mismatch checks for unload `sendBeacon` paths
- snapshot file existence and shape
- payload diff between UI state and launch state

If source and probe disagree, trust the probe and flag the source contract as misleading.

---

## Step 7: Run A Focused Test Slice

Minimum categories:
- settings API tests
- settings store tests
- snapshot transport tests
- launch payload tests
- LLM routing tests
- storage route/page tests
- unload/autosave tests
- invalidation/data-change tests
- legacy compatibility tests

### Audit Rule
Tests passing does not mean the system is clean.
The audit must still record:
- architecture overlap
- duplicate SSOTs
- intentional-but-risky compatibility seams
- stale docs

---

## Step 8: Classify Findings

Every finding must be placed in one of these buckets:

### Active Bug
Current behavior is wrong or lossy.

### Overlapping Ownership
Two places can mutate or clear the same canonical value.

### Legacy But Live
Old key/path still changes behavior.

### Compatibility Only
Still accepted, but intentionally translated to canonical behavior without independent effect.

### Duplicate SSOT
Two files or systems encode the same contract and can drift.

### Doc / Test Drift
Behavior is correct, but the contract around it is stale or misleading.

---

## Step 9: Produce The Deliverables

### Deliverable A: Settings Matrix
Columns:
- key
- area
- canonical owner
- aliases
- UI surfaces
- API route
- persistence target
- launch transport
- runtime consumers
- invalidation domains
- tests
- docs
- status

### Deliverable B: File Matrix
Columns:
- file
- role
- settings touched
- issue category
- severity
- action

### Deliverable C: Findings Summary
Ordered by severity:
- data loss
- launch mismatch
- overlapping ownership
- live legacy
- duplicate contracts
- doc/test drift

### Deliverable D: Validation Record
- commands run
- probe results
- tests run
- pass/fail counts
- GUI proof for the audited edit/save/start/runtime path when the audit closes a phase

---

## Severity Rules

### Critical
- value loss
- wrong runtime behavior at launch
- secret corruption
- save path incompatible with unload path

### High
- overlapping canonical owners
- hidden live legacy overriding current settings
- UI editing one source while runtime launches another

### Medium
- stale compatibility layers still wired into config/runtime
- duplicate invalidation or registry contracts

### Low
- docs drift
- tests missing non-critical characterization

---

## Recommended Commands

```powershell
rg --files -g AGENTS.md
rg -n --glob '!node_modules/**' --glob '!dist/**' --glob '!coverage/**' "(llmPolicy|llm-settings|runtimeSettings|storageSettings|settingsAuthority|settingsDefaults|settingsRegistry|settingsUnloadGuard|dataChangeContract|runtimeSettingsSnapshot|processStartLaunchPlan|llmMaxOutputTokens|helperFilesRoot|searchProvider)" tools/gui-react src test docs
node --test test/llmPolicyRouteHandler.test.js test/llmRouting.test.js test/runtimeSettingsApi.test.js test/runtimeSettingsPutSnapshot.test.js test/storageSettingsRoutes.test.js test/storageSettingsPageContract.test.js test/settingsUnloadGuardContracts.test.js test/indexingRunPayloadContracts.test.js test/contracts/runtimeSettingsSnapshotTransport.test.js test/contracts/settingsPropagationCharacterization.test.js
```

Add route probes when needed for save/unload behavior.

---

## Completion Criteria

The audit is complete only when:
- every setting key has a traced lineage
- every live alias is identified
- every affected file is inventoried
- active bugs are separated from intentional compatibility
- validation evidence is recorded
- GUI proof is attached when the audit is used to close a phase
- the final report makes clear what is canonical, what is legacy, and what is only derived

If any setting cannot be traced from edit surface to runtime consumer, the audit is incomplete.
