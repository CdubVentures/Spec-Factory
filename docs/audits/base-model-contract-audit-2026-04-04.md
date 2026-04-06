# Base Model Contract Audit - 2026-04-04

## Contract

This audit verifies the current product-identity contract across the app:

- `base_model` is the canonical family identity field and primary lookup key.
- `variant` remains a separate differentiator.
- `model` is a derived full/display name, not the canonical identity anchor.
- Old model-first behavior must be gone from ingest, CLI, indexing, runtime status, review, export, recovery, UI, docs, and packaged artifacts.

The audit explicitly checked for these failure modes:

1. code still treating `model` as the canonical family name instead of `base_model`
2. variant duplication in derived names such as `White White`
3. silent `base_model <- model` backfills
4. dropped `base_model` on API, UI, export, queue, or recovery surfaces
5. stale tests/docs still documenting the old contract

## Scope

In scope:

- ingest, CLI, catalog, and update flows
- indexing discovery, search-profile, planner, and identity-guard paths
- runtime/process status, run lists, and GUI storage/runtime surfaces
- publish/export/checkpoint reseed and recovery-adjacent paths
- review queue, websocket, test-mode, and synthetic data providers
- tests, docs, `tools/gui-react/dist`, and `tools/dist/launcher.cjs`

Out of scope:

- generic test-retirement work unrelated to the `base_model`/`variant`/`model` contract
- non-identity product fields

## Final Finding

Validated: the audited app surfaces now treat `base_model` as the canonical identity anchor, keep `variant` separate, and use `model` as a derived full/display value.

The audit found and repaired real contract leaks in:

- CLI identity-lock construction
- review queue payload propagation and websocket change detection
- need-set and query-journey search-profile handoff
- test-mode product generation
- synthetic test-product generation and fallback identity fixtures
- stale UI labels, comments, and docs that still implied model-first identity
- module-relative root resolution used by the rebuilt launcher/runtime bundle

No permanent test retirement was executed in this pass. The in-scope suites were strengthened and kept.

## Source Surface Disposition

| Surface | Key files reviewed/fixed | Disposition | Why |
| --- | --- | --- | --- |
| CLI identity lock | `src/app/cli/commands/pipelineCommands.js` | KEEP | `--model` now seeds `identityLock.base_model`; `identityLock.model` is derived via `deriveFullModel(...)`. |
| Review queue payload | `src/features/review/domain/reviewGridData.js`, `src/features/indexing/api/queueBillingLearningRoutes.js` | KEEP | Queue rows now carry `base_model` end-to-end instead of dropping family identity. |
| Review queue websocket | `src/features/review/domain/queueWebSocket.js` | KEEP | Queue fingerprint now includes `base_model` so identity-only queue changes are observable. |
| Search-profile handoff | `src/features/indexing/pipeline/needSet/runNeedSet.js`, `src/features/indexing/pipeline/queryJourney/runQueryJourney.js` | KEEP | Planned/search-profile state now prefers `job.base_model` or `job.identityLock.base_model`. |
| Identity authority | `src/features/catalog/identity/productIdentityAuthority.js` | KEEP | Empty/fallback identity contracts now include `base_model` explicitly instead of legacy `{ brand, model, variant }`. |
| Test-mode generator | `src/app/api/routes/testModeRoutes.js` | KEEP | Generated `product_catalog.json` rows now include `base_model` alongside derived `model`. |
| Synthetic test data | `src/tests/testDataProvider.js` | KEEP | Generated identities now split family vs variant correctly and stop duplicating variant into full-name strings. |
| Review fixture defaults | `src/features/review/domain/tests/helpers/reviewGridDataHarness.js` | KEEP | Harness defaults now model `base_model` and `variant` as separate identity fields. |
| GUI/runtime identity labels | `tools/gui-react/src/features/catalog/components/ProductManager.tsx`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`, `tools/gui-react/src/features/catalog/state/productStore.ts` | KEEP | UI copy and payloads now describe and emit `base_model` as the primary identity field. |
| Catalog/indexing/runtime helpers | `src/app/api/processRuntime.js`, `src/app/api/catalogHelpers.js`, `src/features/indexing/api/builders/processStartLaunchPlan.js`, `src/features/indexing/api/builders/runListBuilder.js`, `src/pipeline/seams/bootstrapRunProductExecutionState.js`, `src/features/indexing/pipeline/shared/queryPlan.js`, `src/features/color-edition/colorEditionLlmAdapter.js` | KEEP | Runtime and data-path helpers preserve `base_model` through launch, status, and display derivation. |
| Launcher/build root resolution | `src/core/nativeModuleGuard.js`, `src/app/api/guiServerRuntime.js`, `tools/build-exe.mjs` | KEEP | Bundle/runtime root resolution now uses module-relative paths instead of `process.cwd()` assumptions. |
| Docs/comments/dist | `docs/06-references/api-surface.md`, `docs/data-structure/pipeline-data-flow.html`, `docs/data-structure/architecture-reference.html`, `docs/implementation/handoff-color-edition-finder.md`, `docs/implementation/validation-enrichment-roadmap.html`, `docs/implementation/ai-indexing-plans/pipeline/planning/SEARCH-PLANNER-LOGIC-IN-OUT.md`, `docs/implementation/ai-indexing-plans/pipeline/planning/visual-audit/02-needset-three-layers.mmd`, `tools/gui-react/dist`, `tools/dist/launcher.cjs` | KEEP | Stale model-first wording was removed; rebuilt artifacts now reflect the current identity contract. |

## Test Audit Log

Bucket totals for tests considered in this pass:

- KEEP: 34 files
- COLLAPSE: 0 files
- RETIRE: 0 files
- DEFER: 0 files

Proof IDs:

- `P1`: `node --test tools/gui-react/src/features/indexing/api/__tests__/indexingRunStartPayload.test.ts src/app/api/tests/apiProcessRuntimeWiring.test.js src/app/api/routes/tests/processStartRunIdContract.test.js src/app/api/tests/catalogHelpersSqlPath.test.js src/features/indexing/pipeline/shared/tests/discoveryIdentity.test.js src/features/indexing/orchestration/shared/tests/identityHelpers.test.js src/features/indexing/search/tests/queryBuilder.test.js src/features/indexing/pipeline/searchPlanner/tests/searchPlanner.test.js`
  Result: 110 pass, 0 fail
- `P2`: `node --test --test-force-exit src/features/color-edition/tests/colorEditionLlmAdapter.test.js src/features/indexing/api/builders/tests/runListBuilder.test.js src/features/indexing/pipeline/shared/tests/discoveryQueryPlan.test.js tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`
  Result: 41 pass, 0 fail
- `P3`: `node --test src/features/review/api/tests/reviewLaneApiContracts.test.js src/app/api/tests/apiCatalogHelpersWiring.test.js src/features/indexing/pipeline/orchestration/tests/bootstrapPhaseCharacterization.test.js src/features/indexing/search/tests/searchProfile.tiers.test.js src/features/indexing/pipeline/searchProfile/tests/specSeedTemplates.test.js src/features/indexing/search/tests/searchProfile.variant-guards.test.js src/features/indexing/pipeline/searchPlanner/tests/searchPlanner.test.js src/features/indexing/pipeline/searchProfile/tests/tierHierarchyOrder.test.js src/features/indexing/search/tests/searchProfile.brand-host-hints.test.js src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.classificationContracts.test.js src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js src/features/indexing/search/tests/queryBuilderFieldAllocation.test.js src/features/indexing/pipeline/searchProfile/tests/keySearchEnrichment.test.js src/features/indexing/pipeline/searchProfile/tests/brandQueryPriority.test.js src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js src/features/indexing/pipeline/resultProcessing/tests/triageHardDropFilter.test.js src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js src/tests/tests/testRunner.test.js src/tests/tests/testDataProviderSourceIdentity.test.js src/app/cli/commands/tests/commandIndexLabCharacterization.test.js src/features/indexing/orchestration/bootstrap/tests/buildJobFromDb.test.js`
  Result: 190 pass, 0 fail
- `P4`: `node --test src/features/catalog/identity/tests/productIdentityAuthority.test.js src/features/review/domain/tests/reviewGridData.categoryQueueContracts.test.js src/features/review/domain/tests/reviewGridData.identityFallbackContracts.test.js src/features/review/domain/tests/reviewQueueWebSocket.test.js src/app/api/routes/tests/testModeRoutesContract.test.js src/tests/tests/testRunner.test.js src/tests/tests/testDataProviderSourceIdentity.test.js src/features/review/api/tests/reviewLaneApiContracts.test.js tools/gui-react/src/stores/__tests__/indexlabPickerSessionStore.test.js`
  Result: 47 pass, 0 fail
- `F1`: `npm test`
  Result: 7043 pass, 0 fail

| Test file reviewed | Bucket | Why it stays | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/gui-react/src/features/indexing/api/__tests__/indexingRunStartPayload.test.ts` | KEEP | Protects API launch payload identity contract. | None. Strengthened in place. | `P1`, `F1` | Confirms `base_model` remains the primary launch identity field. |
| `src/app/api/tests/apiProcessRuntimeWiring.test.js` | KEEP | Protects runtime API wiring and process identity exposure. | None. Strengthened in place. | `P1`, `F1` | Preserves runtime/status contract. |
| `src/app/api/routes/tests/processStartRunIdContract.test.js` | KEEP | Protects run-start API/run-id contract around indexing launches. | None. | `P1`, `F1` | Kept as contract coverage. |
| `src/app/api/tests/catalogHelpersSqlPath.test.js` | KEEP | Protects SQL catalog helper contract and product identity propagation. | None. | `P1`, `F1` | Kept as behavior coverage. |
| `src/features/indexing/pipeline/shared/tests/discoveryIdentity.test.js` | KEEP | Protects discovery identity normalization and family/variant split. | None. | `P1`, `F1` | Kept as direct contract proof. |
| `src/features/indexing/orchestration/shared/tests/identityHelpers.test.js` | KEEP | Protects orchestration identity helpers used by runtime planning. | None. | `P1`, `F1` | Kept as shared helper contract. |
| `src/features/indexing/search/tests/queryBuilder.test.js` | KEEP | Protects query composition from normalized product identity. | None. | `P1`, `F1` | Kept as search contract proof. |
| `src/features/indexing/pipeline/searchPlanner/tests/searchPlanner.test.js` | KEEP | Protects planner behavior and query allocation from family identity. | None. | `P1`, `P3`, `F1` | Kept after base-model assertions were aligned. |
| `src/features/color-edition/tests/colorEditionLlmAdapter.test.js` | KEEP | Protects derived color-edition naming without breaking family identity. | None. | `P2`, `F1` | Kept as runtime behavior protection. |
| `src/features/indexing/api/builders/tests/runListBuilder.test.js` | KEEP | Protects run-list API/export identity exposure. | None. | `P2`, `F1` | Kept as downstream contract proof. |
| `src/features/indexing/pipeline/shared/tests/discoveryQueryPlan.test.js` | KEEP | Protects query-plan shape and derived display naming. | None. | `P2`, `F1` | Kept as planner contract coverage. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js` | KEEP | Protects GUI runtime identity display contract. | None. | `P2`, `F1` | Kept as user-visible behavior coverage. |
| `src/features/review/api/tests/reviewLaneApiContracts.test.js` | KEEP | Protects review-lane API payload shape for queue/review identity. | None. Strengthened in place. | `P3`, `P4`, `F1` | Kept as review API contract coverage. |
| `src/app/api/tests/apiCatalogHelpersWiring.test.js` | KEEP | Protects API-to-catalog wiring of identity fields. | None. | `P3`, `F1` | Kept as wiring contract proof. |
| `src/features/indexing/pipeline/orchestration/tests/bootstrapPhaseCharacterization.test.js` | KEEP | Protects bootstrap-orchestration identity behavior. | None. | `P3`, `F1` | Kept as characterization coverage. |
| `src/features/indexing/search/tests/searchProfile.tiers.test.js` | KEEP | Protects tiered search-profile behavior from canonical family identity. | None. | `P3`, `F1` | Kept as planner/search behavior coverage. |
| `src/features/indexing/pipeline/searchProfile/tests/specSeedTemplates.test.js` | KEEP | Protects seeded profile/template behavior around identity fields. | None. | `P3`, `F1` | Kept after fixture correction. |
| `src/features/indexing/search/tests/searchProfile.variant-guards.test.js` | KEEP | Protects variant separation and guardrail behavior. | None. | `P3`, `F1` | Kept as direct variant-contract proof. |
| `src/features/indexing/pipeline/searchProfile/tests/tierHierarchyOrder.test.js` | KEEP | Protects tier precedence and family-first search ordering. | None. | `P3`, `F1` | Kept as ordering contract proof. |
| `src/features/indexing/search/tests/searchProfile.brand-host-hints.test.js` | KEEP | Protects brand/host hint enrichment without collapsing family identity into model strings. | None. | `P3`, `F1` | Kept as planner enrichment coverage. |
| `src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.classificationContracts.test.js` | KEEP | Protects URL classification against identity regression. | None. | `P3`, `F1` | Kept as classifier contract coverage. |
| `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js` | KEEP | Protects current search-profile stage behavior before/after fixture corrections. | None. | `P3`, `F1` | Kept as characterization proof. |
| `src/features/indexing/search/tests/queryBuilderFieldAllocation.test.js` | KEEP | Protects query field allocation for family vs variant fields. | None. | `P3`, `F1` | Kept as search builder contract proof. |
| `src/features/indexing/pipeline/searchProfile/tests/keySearchEnrichment.test.js` | KEEP | Protects key-search enrichment from dropping `base_model`. | None. | `P3`, `F1` | Kept as enrichment coverage. |
| `src/features/indexing/pipeline/searchProfile/tests/brandQueryPriority.test.js` | KEEP | Protects search priority behavior combining brand + family identity. | None. | `P3`, `F1` | Kept as priority contract proof. |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` | KEEP | Protects brand resolution without model-first fallback. | None. | `P3`, `F1` | Kept as resolver coverage. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageHardDropFilter.test.js` | KEEP | Protects result triage behavior on identity-aware rows. | None. | `P3`, `F1` | Kept as downstream processing coverage. |
| `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js` | KEEP | Protects need-set handoff after `base_model` propagation fix. | None. | `P3`, `F1` | Kept as stage contract proof. |
| `src/tests/tests/testRunner.test.js` | KEEP | Protects synthetic execution/test harness identity wiring. | None. Strengthened in place. | `P3`, `P4`, `F1` | Kept as harness behavior coverage. |
| `src/tests/tests/testDataProviderSourceIdentity.test.js` | KEEP | Protects generated test-source identity splits and prevents variant duplication. | None. Strengthened in place. | `P3`, `P4`, `F1` | Kept as direct contract proof. |
| `src/app/cli/commands/tests/commandIndexLabCharacterization.test.js` | KEEP | Protects CLI launch-plan behavior and `identityLock` contract. | None. | `P3`, `F1` | Kept as characterization coverage for CLI identity creation. |
| `src/features/indexing/orchestration/bootstrap/tests/buildJobFromDb.test.js` | KEEP | Protects DB-to-job identity propagation in bootstrap flows. | None. | `P3`, `F1` | Kept as runtime bootstrap coverage. |
| `src/features/catalog/identity/tests/productIdentityAuthority.test.js` | KEEP | Protects fallback/authority behavior and now asserts empty `base_model` when appropriate. | None. Strengthened in place. | `P4`, `F1` | Kept as catalog identity contract proof. |
| `src/features/review/domain/tests/reviewGridData.categoryQueueContracts.test.js` | KEEP | Protects review queue rows including `base_model` + derived `model`. | None. Strengthened in place. | `P4`, `F1` | Kept as queue payload contract proof. |
| `src/features/review/domain/tests/reviewGridData.identityFallbackContracts.test.js` | KEEP | Protects empty/fallback review identity behavior. | None. Strengthened in place. | `P4`, `F1` | Kept as identity fallback coverage. |
| `src/features/review/domain/tests/reviewQueueWebSocket.test.js` | KEEP | Protects websocket queue-change detection after fingerprint fix. | None. | `P4`, `F1` | Kept as runtime review/live-update coverage. |
| `src/app/api/routes/tests/testModeRoutesContract.test.js` | KEEP | Protects test-mode generation of `base_model` and derived `model`. | None. Added/strengthened in place. | `P4`, `F1` | Kept as generation contract proof. |
| `tools/gui-react/src/stores/__tests__/indexlabPickerSessionStore.test.js` | KEEP | Protects GUI picker/session behavior after base-model terminology cleanup. | None. | `P4`, `F1` | Kept as GUI contract coverage. |

## Direct Runtime Validation

- `LR1`: synthetic test-product repro
  - exercised `buildTestProducts('_test_mouse', null)`
  - observed first product identity lock:
    - `{"brand":"TestCo","base_model":"Scenario 1","model":"Scenario 1 happy_path","variant":"happy_path","id":9001,"identifier":"test001a"}`
- `LR2`: review queue repro
  - exercised `buildReviewQueue(...)` with seeded SQL product + queue row
  - observed queue item identity:
    - `{"product_id":"mouse-audit-1","brand":"Razer","base_model":"Viper V3 Pro","model":"Viper V3 Pro Wireless","variant":"Wireless"}`

These repros confirm the fixed behavior on two runtime-critical paths where identity splitting had to remain correct outside pure unit tests.

## Build / Artifact Proof

- `B1`: `npm run gui:exe`
  - rebuilt `tools/gui-react/dist`
  - rebuilt `tools/dist/launcher.cjs`
  - rebuilt `SpecFactory.exe`
  - refreshed `gui-dist/`

Post-build searches confirmed the rebuilt GUI assets now contain the updated base-model-first wording and no longer ship the stale model-first UI copy that was removed in source.

## Preserved Behavior

The remaining suite and direct proofs still protect:

- resolved config and runtime launch identity
- API/request/response identity shape
- search-profile and planner family/variant behavior
- review queue, websocket, and UI-visible identity rendering
- export/run-list/test-mode identity propagation
- synthetic test-data generation and recovery/fallback identity behavior

## Remaining Uncertainty

Low residual risk remains around the packaged launcher runtime only:

- the `gui:exe` rebuild succeeded, but esbuild emitted `import.meta` warnings for `src/app/api/guiServerRuntime.js` and `src/core/nativeModuleGuard.js`
- both files now guard with `typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url)`, so the CommonJS bundle should use `__filename`
- I did not run a separate packaged-launcher smoke because the launcher forcibly injects `--open` and kills the selected port occupant before boot, which is too intrusive for a safe shared-workspace validation step

This does not change the identity-contract conclusion above, but it is the only remaining non-zero runtime risk from the rebuild.

## Final Disposition

Status: validated.

- `base_model` is the canonical family identity across the audited app surfaces
- `variant` remains separate
- `model` is treated as a derived full/display value
- no in-scope suite was retired; all 34 reviewed suites were classified `KEEP`
- targeted proof green, full suite green, direct runtime repros green, rebuilt artifacts updated
