# Test Surface Reduction Audit - 2026-03-16

> **Purpose:** Preserve the historical test-retirement audit record from the 2026-03-16 suite-reduction pass.
> **Prerequisites:** [../README.md](../README.md), [../05-operations/known-issues.md](../05-operations/known-issues.md)
> **Last validated:** 2026-03-17

Historical note: this file captures one specific test-surface reduction pass. Its suite counts and timings are not the current global baseline for the repo after subsequent work.

## Scope

- Mission: reduce default `node --test` runtime below 60 seconds without weakening contract coverage.
- In scope: highest-cost test files from the profiling pass, especially spawned-server, Playwright, IPC, and brittle implementation-coupled tests.
- Out of scope: unrelated product changes and unrelated failures outside the reviewed files.

## Historical Baseline

| Metric | Value |
|--------|-------|
| command | `node --test --test-reporter=tap` |
| baseline wall time | `503865.4 ms` |
| baseline result | fail |
| post-pass wall time | `42368.08 ms` |
| improvement | about `91.6%` faster |

## Primary Audit Decisions

| File | Bucket | Why | Final disposition |
|------|--------|-----|-------------------|
| `test/runtimeArtifactRootsTempDefaults.test.js` | `COLLAPSE` | slow hung integration coverage duplicated faster runtime-config and relocation contracts | deleted; replaced by `test/runtimeArtifactRoots.contract.test.js` |
| `test/indexlabIpcExitContract.test.js` | `RETIRE` | brittle spawned-process timeout duplicated process-completion contracts | deleted |
| `test/storageSettingsGuiPersistencePropagation.test.js` | `RETIRE` | duplicated storage page, route, and autosave persistence contracts | deleted |
| `test/sourceStrategyGuiPersistencePropagation.test.js` | `RETIRE` | duplicated source-strategy route and category-scope contracts | deleted |
| `test/studioSettingsGuiPersistencePropagation.test.js` | `RETIRE` | duplicated UI settings persistence and studio page contracts | deleted |
| `test/runtimeOpsGuiSettingsPersistencePropagation.test.js` | `RETIRE` | duplicated runtime-settings API and runtime-ops builder coverage | deleted |
| `test/runtimeOpsSearchWorkerInlineResultsGui.test.js` | `RETIRE` | duplicated runtime-ops worker/search-result linkage coverage | deleted |
| `test/runtimeSettingsApi.test.js` | `KEEP` | real runtime settings API and persistence contract | retained |
| `test/indexingDomainChecklistApi.test.js` | `RETIRE` | duplicated checklist-builder behavior and route wiring | deleted |
| `test/guiServerRootPathResolution.test.js` | `RETIRE` | duplicated faster runtime-config path contracts | deleted |
| `test/settingsCanonicalOnlyWrites.test.js` | `KEEP` | protects canonical persistence-mode behavior | retained |
| `test/llmSettingsGuiPersistencePropagation.test.js` | `RETIRE` | duplicated LLM settings page, route, and autosave contracts | deleted |
| `test/indexingOrchestrationExecutionArchitecture.test.js` | `RETIRE` | source-text cycle guard protected layout rather than behavior | deleted |
| `test/crawleeScreencast.test.js` | `COLLAPSE` | slow screencast behavior duplicated faster contract coverage | deleted; replaced by `test/runtimeScreencast.contract.test.js` |
| `test/runtimeFlowSectionExposureContracts.test.js` | `RETIRE` | text/label contract duplicated route and page behavior coverage | deleted |
| `test/sourceStrategySectionContract.test.js` | `RETIRE` | copy/label test duplicated source-strategy persistence contracts | deleted |
| `test/themeProfileGuiContract.test.js` | `KEEP` | only reviewed end-to-end app-shell appearance contract left standing | retained |

## Stabilization Follow-Up

| File | Bucket | Why | Final disposition |
|------|--------|-----|-------------------|
| `test/fixtures/runtimeFlowDraftNormalizationModuleBoundary.entry.ts` | `RETIRE` | fixture file was being picked up as a standalone test | moved to `fixtures/module-boundaries/` |
| `test/fixtures/runtimeSettingsAuthorityModuleBoundary.entry.ts` | `RETIRE` | fixture file was being picked up as a standalone test | moved to `fixtures/module-boundaries/` |
| `test/fixtures/runtimeSettingsManifestModuleBoundary.entry.ts` | `RETIRE` | fixture file was being picked up as a standalone test | moved to `fixtures/module-boundaries/` |
| `test/fixtures/settingsManifestModuleBoundary.entry.ts` | `RETIRE` | fixture file was being picked up as a standalone test | moved to `fixtures/module-boundaries/` |
| `test/indexingOrchestrationRunProductFinalizationDerivation.test.js` | `KEEP` | assertion updated to match the current planner-bundle contract | retained |
| `test/runtimeOpsLiveSettingsPanelContracts.test.js` | `KEEP` | assertion updated to target the current non-empty hero badge rendering | retained |
| `test/searchPlanningContext.test.js` | `KEEP` | expectation updated to the current default discovery invariant | retained |

## Replacement / Preserved Proof

| Proof class | Evidence |
|-------------|----------|
| replacement bundle | targeted replacement and retained bundle passed with `wall_ms=12045.08` |
| failure-fix bundle | follow-up bundle passed with `74 pass` and `wall_ms=1193.87` |
| full suite | historical full suite passed with `5444 pass`, `0 fail`, TAP duration `42203.9972 ms` |
| live validation | not run in this pass; proof was test-only |

## Current Relevance

- Keep using this file for historical retirement rationale and preserved-coverage lineage.
- Do not use its suite totals as the present-day repo baseline; the current baseline lives in [documentation-audit-ledger.md](./documentation-audit-ledger.md) and [../05-operations/known-issues.md](../05-operations/known-issues.md).

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| test | `test/runtimeArtifactRoots.contract.test.js` | replacement contract coverage introduced by the pass |
| test | `test/runtimeScreencast.contract.test.js` | replacement screencast contract coverage introduced by the pass |
| test | `test/runtimeSettingsApi.test.js` | retained settings contract coverage cited by the audit |
| test | `test/themeProfileGuiContract.test.js` | retained GUI contract coverage cited by the audit |
| command | `node --test --test-reporter=tap` | historical full-suite proof recorded by this audit |

## Related Documents

- [../05-operations/known-issues.md](../05-operations/known-issues.md) - current known issues and present-day suite caveats.
- [../07-patterns/anti-patterns.md](../07-patterns/anti-patterns.md) - current guidance against implementation-coupled tests.
- [./documentation-audit-ledger.md](./documentation-audit-ledger.md) - current documentation audit ledger for this maintained docs tree.
