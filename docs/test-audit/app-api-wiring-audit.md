# Contract Test Audit Log

> **Purpose:** Preserve the historical test-audit record for prior contract-test retirement work without treating it as current-state authority for the live docs set.
> **Prerequisites:** [../README.md](../README.md), [../05-operations/documentation-audit-ledger.md](../05-operations/documentation-audit-ledger.md)
> **Last validated:** 2026-03-24

## Extension: Identity Knob Retirement Audit

### Scope

- `src/features/indexing/validation/tests/identityKnobRetirement.test.js`
- `src/features/indexing/validation/tests/identityGate.test.js`
- `src/features/indexing/validation/tests/identityGateRelaxed.test.js`
- `src/shared/tests/settingsDefaultsEnvSync.test.js`
- `src/features/settings-authority/tests/settingsContract.test.js`
- `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`
- `tools/gui-react/src/features/pipeline-settings/state/__tests__/settingsSurfaceContracts.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/validation/tests/identityKnobRetirement.test.js` | RETIRE | Migration-residue assertions duplicated identity-threshold behavior, retired settings absence, and empty convergence-surface checks already protected at stronger contract boundaries. It also included internal export policing with no product value. | Existing coverage remains in `src/features/indexing/validation/tests/identityGate.test.js`, `src/features/indexing/validation/tests/identityGateRelaxed.test.js`, `src/shared/tests/settingsDefaultsEnvSync.test.js`, `src/features/settings-authority/tests/settingsContract.test.js`, `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`, and `tools/gui-react/src/features/pipeline-settings/state/__tests__/settingsSurfaceContracts.test.js`. | Targeted replacement proof green on 2026-03-24. | Deleted. |

### Proof Stack

- `node --test src/features/indexing/validation/tests/identityGate.test.js src/features/indexing/validation/tests/identityGateRelaxed.test.js`
- Result: green, 32/32 passing on 2026-03-24.
- `node --test src/shared/tests/settingsDefaultsEnvSync.test.js src/features/settings-authority/tests/settingsContract.test.js src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`
- Result: green, 21/21 passing on 2026-03-24.
- `npm test`
- Result: green, 6503/6503 passing on 2026-03-24.

## Extension: LLM Registry Resolver Audit

### Scope

- `src/core/llm/tests/registryResolverConsolidation.characterization.test.js`
- `src/core/llm/client/tests/roleTokenCapRegistry.test.js`
- `src/core/llm/tests/pricingRegistryConsolidation.test.js`
- `src/core/llm/tests/llmProviderRegistryConsolidation.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/core/llm/tests/registryResolverConsolidation.characterization.test.js` | RETIRE | It characterized routing and helper internals that are now covered directly by smaller registry-first contract suites. Keeping it only duplicated coverage through a more brittle integration shape. | Existing coverage remains in `src/core/llm/client/tests/roleTokenCapRegistry.test.js`, `src/core/llm/tests/pricingRegistryConsolidation.test.js`, and `src/core/llm/tests/llmProviderRegistryConsolidation.test.js`. | Targeted replacement proof green on 2026-03-24. | Deleted. |
| `src/core/llm/client/tests/roleTokenCapRegistry.test.js` | KEEP | Protects the token-cap contract directly, including plan/triage/reasoning/fallback ceilings and registry clamping behavior. | No replacement required. | Targeted replacement proof green on 2026-03-24. | Kept unchanged. |
| `src/core/llm/tests/pricingRegistryConsolidation.test.js` | KEEP | Protects registry-first pricing and token-profile resolution without going through unrelated resolver wiring. | No replacement required. | Targeted replacement proof green on 2026-03-24. | Kept unchanged. |
| `src/core/llm/tests/llmProviderRegistryConsolidation.test.js` | KEEP | Protects provider dispatch and route/provider alignment at the public model/provider contract boundary. | No replacement required. | Targeted replacement proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/core/llm/client/tests/roleTokenCapRegistry.test.js src/core/llm/tests/pricingRegistryConsolidation.test.js src/core/llm/tests/llmProviderRegistryConsolidation.test.js`
- Result: green, 35/35 passing on 2026-03-24.
- `npm test`
- Result: green, 6503/6503 passing on 2026-03-24.

## Extension: Review Grid Field-State Audit

### Scope

- `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.characterization.test.js`
- `src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js`
- `src/features/review/contracts/tests/reviewFieldContract.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js` | KEEP | Protects fallback candidate hydration and scalar-shape candidate selection, both of which are real field-state outcome contracts. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js` | KEEP | Protects list-value rendering and lightweight candidate omission behavior. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js` | KEEP | Protects contradiction signaling and precedence in the returned field state. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/domain/tests/reviewGridData.fieldState.characterization.test.js` | RETIRE | It only asserted exact decimal pass-through for a single builder path. Neither the review field contract nor surrounding payload/runtime tests treat grid-layer rounding absence as a public guarantee, so the test only protected incidental implementation. | Existing coverage remains in `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js`, `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js`, `src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js`, `src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js`, `src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js`, and `src/features/review/contracts/tests/reviewFieldContract.test.js`. | Targeted field-state proof green on 2026-03-24. | Deleted. |
| `src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js` | KEEP | Protects the returned lightweight payload surface when candidate arrays are omitted. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js` | KEEP | Protects written review artifacts and persisted payload shape. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/contracts/tests/reviewFieldContract.test.js` | KEEP | Protects the canonical field-state key contract exposed to review consumers. | No replacement required. | Targeted field-state proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js src/features/review/contracts/tests/reviewFieldContract.test.js`
- Result: green, 16/16 passing on 2026-03-24.
- `node --test src/features/review/domain/tests/*.test.js`
- Result: green, 127/127 passing on 2026-03-24.
- `npm test`
- Result: green, 6503/6503 passing on 2026-03-24.

## Extension: LLM Fast-Key Retirement Audit

### Scope

- `src/core/llm/client/tests/llmFastRemoval.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`
- `src/core/llm/client/tests/llmRouting.test.js`
- `src/core/config/tests/llmConfigReadSurface.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/core/llm/client/tests/llmFastRemoval.test.js` | RETIRE | The file mixed dead-key policing across defaults, clamping maps, route maps, helper-return shapes, and registry JSON internals. Most of that duplicated broader read-surface coverage and pinned implementation scatter rather than a public contract. | Public fast-key absence is now asserted through `src/shared/tests/runtimeSettingsApi.test.js`, and the surviving route-reason behavior is covered in `src/core/llm/client/tests/llmRouting.test.js`. Broader dead-key read-surface coverage remains in `src/core/config/tests/llmConfigReadSurface.test.js`. | Targeted replacement proof green on 2026-03-24. | Deleted. |
| `src/shared/tests/runtimeSettingsApi.test.js` | COLLAPSE | The live runtime-settings API already protected the public read surface. It now absorbs the only meaningful fast-key contract: retired fast keys must stay off `GET /runtime-settings`. | Expanded `RETIRED_KEYS` coverage for `llmModelFast` and `llmMaxOutputTokensFast`. | Targeted replacement proof green on 2026-03-24. | Kept with stronger API-level coverage. |
| `src/core/llm/client/tests/llmRouting.test.js` | KEEP | Routing behavior for planner reasons is a runtime contract. | Expanded the existing routing contract to assert `discovery_planner_primary` resolves through the plan lane and that plan-mapped reasons keep `route.role === 'plan'`. | Targeted replacement proof green on 2026-03-24. | Kept with a small contract addition. |
| `src/core/config/tests/llmConfigReadSurface.test.js` | KEEP | Continues to cover the broader dead-key read-surface contract across route maps, defaults, clamping ranges, and env metadata. | No replacement required. | Targeted replacement proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/shared/tests/runtimeSettingsApi.test.js src/core/llm/client/tests/llmRouting.test.js src/core/config/tests/llmConfigReadSurface.test.js`
- Result: green, 59/59 passing on 2026-03-24.
- `npm test`
- Result: green, 6494/6494 passing on 2026-03-24.

## Extension: Settings Registry Grouping Audit

### Scope

- `src/shared/tests/settingsRegistryCompleteness.test.js`
- `src/shared/tests/settingsRegistryTransportContract.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/shared/tests/settingsRegistryCompleteness.test.js` | COLLAPSE | The retired `uiGroup` assertion enforced a presentation policy for large sections rather than a runtime or transport contract. It broke on legitimate registry organization changes without protecting the actual category/section derivation behavior. | Existing coverage remains in the same file for UI metadata presence, `disabledBy` integrity, and `deriveUiCategoryMap(...)` output completeness. Transport coverage remains in `src/shared/tests/settingsRegistryTransportContract.test.js`. | Targeted registry proof green on 2026-03-24. | Kept with the non-contract `uiGroup` policy assertion removed. |
| `src/shared/tests/settingsRegistryTransportContract.test.js` | KEEP | Protects the registry transport surface: config-key uniqueness, env-key validity, and derived lookup-map fidelity. | No replacement required. | Targeted registry proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/shared/tests/settingsRegistryCompleteness.test.js src/shared/tests/settingsRegistryTransportContract.test.js`
- Result: green, 12/12 passing on 2026-03-24.
- `npm test`
- Result: green, 6494/6494 passing on 2026-03-24.

## Extension: Infra Route Context Audit

### Scope

- `src/app/api/tests/guiRouteContextShape.characterization.test.js`
- `src/api/tests/guiServerHttpAssembly.test.js`
- `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`
- `src/app/api/routes/tests/infraRoutesContract.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/guiRouteContextShape.characterization.test.js` | RETIRE | It only asserted that `createInfraRouteContext(...)` returned the same injected references and enforced an object-input type guard. That is internal assembly wiring, not a runtime contract. | Existing infra route behavior remains covered by `src/api/tests/guiServerHttpAssembly.test.js`, `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`, and `src/app/api/routes/tests/infraRoutesContract.test.js`. | Targeted replacement proof pending in this audit pass. | Deleted. |
| `src/api/tests/guiServerHttpAssembly.test.js` | KEEP | Protects the returned HTTP assembly contract. | No replacement required. | Targeted replacement proof pending in this audit pass. | Kept unchanged. |
| `src/app/api/routes/infra/tests/infraProcessRoutes.test.js` | KEEP | Protects process-route behavior that infra callers actually depend on. | No replacement required. | Targeted replacement proof pending in this audit pass. | Kept unchanged. |
| `src/app/api/routes/tests/infraRoutesContract.test.js` | KEEP | Protects the live infra route request/response contract for health, categories, SearXNG start failures, and GraphQL proxying. | No replacement required. | Targeted replacement proof pending in this audit pass. | Kept unchanged. |

### Proof Stack

- `node --test src/api/tests/guiServerHttpAssembly.test.js src/app/api/routes/infra/tests/infraProcessRoutes.test.js src/app/api/routes/tests/infraRoutesContract.test.js`
- Result: green, 10/10 passing on 2026-03-24.
- `npm test`
- Result: green, 6512/6512 passing on 2026-03-24.

## Extension: Route Context Cluster Audit

### Scope

- `src/features/studio/api/tests/studioRouteContext.test.js`
- `src/features/studio/api/tests/studioRouteHelpers.test.js`
- `src/features/studio/api/tests/studioRoutesPropagation.test.js`
- `src/features/settings/api/tests/configRouteContext.test.js`
- `src/features/settings/api/tests/configPersistenceContext.test.js`
- `src/features/settings/api/tests/configRoutesPersistenceFailure.test.js`
- `src/features/settings/api/tests/settingsEnvelopeContract.test.js`
- `src/features/settings/api/tests/storageSettingsRoutes.test.js`
- `src/features/settings/api/tests/uiSettingsRoutes.test.js`
- `src/features/catalog/api/tests/catalogRouteContext.test.js`
- `src/features/catalog/api/tests/brandRouteContext.test.js`
- `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js`
- `src/app/api/routes/tests/testModeRouteContext.test.js`
- `src/app/api/routes/tests/testModeRoutesContract.test.js`
- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/studio/api/tests/studioRouteContext.test.js` | RETIRE | It only asserted object-type guarding, exact injected references, helper exposure, and dropped extras for `createStudioRouteContext(...)`. That is internal assembly shape, not runtime behavior. | Public behavior remains covered by `src/features/studio/api/tests/studioRouteHelpers.test.js` and `src/features/studio/api/tests/studioRoutesPropagation.test.js`. | Targeted route-context proof green on 2026-03-24. | Deleted. |
| `src/features/studio/api/tests/studioRouteHelpers.test.js` | KEEP | Protects helper behavior and returned data transformations that studio callers depend on. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/studio/api/tests/studioRoutesPropagation.test.js` | KEEP | Protects live route outcomes for SpecDb authority, data-change emission, empty overwrite rejection, and known-values behavior. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/configRouteContext.test.js` | RETIRE | It pinned the exact `createConfigRouteContext(...)` key list and reference identity instead of asserting any request/response contract. | Public settings behavior remains covered by `src/features/settings/api/tests/configPersistenceContext.test.js`, `src/features/settings/api/tests/configRoutesPersistenceFailure.test.js`, `src/features/settings/api/tests/settingsEnvelopeContract.test.js`, `src/features/settings/api/tests/storageSettingsRoutes.test.js`, and `src/features/settings/api/tests/uiSettingsRoutes.test.js`. | Targeted route-context proof green on 2026-03-24. | Deleted. |
| `src/features/settings/api/tests/configPersistenceContext.test.js` | KEEP | Protects the persistence context behavior that config route consumers rely on. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/configRoutesPersistenceFailure.test.js` | KEEP | Protects runtime rollback and error behavior when settings persistence fails. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/settingsEnvelopeContract.test.js` | KEEP | Protects the public settings PUT envelope contract. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/storageSettingsRoutes.test.js` | KEEP | Protects storage settings route behavior and emitted change contracts. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/uiSettingsRoutes.test.js` | KEEP | Protects the UI settings GET/PUT surface and stored snapshot behavior. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/features/catalog/api/tests/catalogRouteContext.test.js` | RETIRE | It only enforced `createCatalogRouteContext(...)` assembly shape, helper exposure, and dropped extras. | Route behavior remains covered by `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js`. | Targeted route-context proof green on 2026-03-24. | Deleted. |
| `src/features/catalog/api/tests/brandRouteContext.test.js` | RETIRE | It only enforced `createBrandRouteContext(...)` assembly shape, helper exposure, and dropped extras. | Route behavior remains covered by `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js`. | Targeted route-context proof green on 2026-03-24. | Deleted. |
| `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js` | KEEP | Protects catalog and brand route outcomes, SpecDb propagation, queue cleanup failures, and emitted data-change contracts. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |
| `src/app/api/routes/tests/testModeRouteContext.test.js` | COLLAPSE | It only asserted the internal shape of `createTestModeRouteContext(...)`, which was the last remaining test-mode coverage. The only valuable protection in this slice is the handler contract itself. | Replaced by `src/app/api/routes/tests/testModeRoutesContract.test.js`, with surrounding path coverage in `src/app/api/tests/guiServerRouteRegistryWiring.test.js`. | Targeted route-context proof green on 2026-03-24. | Deleted after contract replacement landed. |
| `src/app/api/routes/tests/testModeRoutesContract.test.js` | KEEP | Protects the public test-mode route contract for missing source categories, empty status surface, invalid non-test category rejection, and delete-path rejection. | Replacement for the retired internal context test. | Targeted route-context proof green on 2026-03-24. | Added and kept. |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | KEEP | Protects top-level route parsing for test-mode paths so handler registration stays reachable. | No replacement required. | Targeted route-context proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/studio/api/tests/studioRouteHelpers.test.js src/features/studio/api/tests/studioRoutesPropagation.test.js src/features/settings/api/tests/configPersistenceContext.test.js src/features/settings/api/tests/configRoutesPersistenceFailure.test.js src/features/settings/api/tests/settingsEnvelopeContract.test.js src/features/settings/api/tests/storageSettingsRoutes.test.js src/features/settings/api/tests/uiSettingsRoutes.test.js src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js src/app/api/routes/tests/testModeRoutesContract.test.js src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- Result: green, 57/57 passing on 2026-03-24.
- `npm test`
- Result: green, 6501/6501 passing on 2026-03-24.

## Extension: Authority And Indexing Route Context Audit

### Scope

- `src/features/category-authority/api/tests/dataAuthorityRouteContext.test.js`
- `src/features/category-authority/api/tests/dataAuthorityRoutes.test.js`
- `src/features/indexing/api/tests/sourceStrategyRouteContext.test.js`
- `src/features/indexing/api/tests/sourceStrategyCategoryScope.test.js`
- `src/features/indexing/api/tests/sourceStrategyRoutesDataChangeContract.test.js`
- `src/features/indexing/api/tests/runtimeOpsRouteContext.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.prefetch.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.workers.test.js`
- `src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js`
- `src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js`
- `src/features/indexing/api/tests/queueBillingLearningRouteContext.test.js`
- `src/features/indexing/api/tests/configQueueDataChangeContractRoutes.test.js`
- `src/features/indexing/api/tests/indexlabRouteContext.test.js`
- `src/features/indexing/api/tests/indexlabRoutes.test.js`
- `src/features/indexing/api/tests/queryIndexApi.test.js`
- `src/features/indexing/api/tests/urlIndexApi.test.js`
- `src/features/indexing/api/tests/liveCrawlApiRoute.test.js`
- `src/features/indexing/api/tests/crossRunAnalyticsApi.test.js`
- `src/api/tests/indexlabAutomationQueueApi.test.js`
- `src/api/tests/indexlabPhase07Api.test.js`
- `src/api/tests/indexlabPhase08Api.test.js`
- `src/api/tests/indexlabSchemaPacketsApi.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/category-authority/api/tests/dataAuthorityRouteContext.test.js` | RETIRE | It only asserted object-input rejection plus forwarded references for `createDataAuthorityRouteContext(...)`. That protects assembly shape, not the snapshot contract. | Snapshot behavior remains covered by `src/features/category-authority/api/tests/dataAuthorityRoutes.test.js`. | Targeted authority/indexing route proof pending in this audit pass. | Deleted. |
| `src/features/category-authority/api/tests/dataAuthorityRoutes.test.js` | KEEP | Protects the authority snapshot response shape, changed-domain output, and SpecDb fallback behavior. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/sourceStrategyRouteContext.test.js` | RETIRE | It only asserted `createSourceStrategyRouteContext(...)` type guarding and forwarded refs. | Source-strategy behavior remains covered by `src/features/indexing/api/tests/sourceStrategyCategoryScope.test.js` and `src/features/indexing/api/tests/sourceStrategyRoutesDataChangeContract.test.js`. | Targeted authority/indexing route proof pending in this audit pass. | Deleted. |
| `src/features/indexing/api/tests/sourceStrategyCategoryScope.test.js` | KEEP | Protects required category scoping and returned strategy rows at the route boundary. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/sourceStrategyRoutesDataChangeContract.test.js` | KEEP | Protects emitted data-change contracts for source-strategy create, update, and delete flows. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRouteContext.test.js` | RETIRE | It only asserted `createRuntimeOpsRouteContext(...)` forwarded refs and helper exposure. That is internal route assembly wiring. | Runtime behavior remains covered by `src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js`, `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js`, `src/features/indexing/api/tests/runtimeOpsRoutes.prefetch.test.js`, `src/features/indexing/api/tests/runtimeOpsRoutes.workers.test.js`, `src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js`, and `src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js`, with live proof in the `src/api/tests/indexlab*.test.js` slice. | Targeted authority/indexing route proof pending in this audit pass. | Deleted. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js` | KEEP | Protects runtime summary and document contracts, relocation behavior, terminal-state projection, and route matching. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js` | KEEP | Protects runtime asset and screencast retrieval behavior. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.prefetch.test.js` | KEEP | Protects runtime prefetch payload behavior and gating. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.workers.test.js` | KEEP | Protects runtime worker list/detail contracts and live preview payload behavior. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js` | KEEP | Protects phase 13.2 extraction, fallback, and queue route contracts. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js` | KEEP | Protects runtime asset fast-path behavior and path safety guards. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/queueBillingLearningRouteContext.test.js` | RETIRE | It only asserted `createQueueBillingLearningRouteContext(...)` assembly shape and helper exposure. | Queue mutation behavior remains covered by `src/features/indexing/api/tests/configQueueDataChangeContractRoutes.test.js`. | Targeted authority/indexing route proof pending in this audit pass. | Deleted. |
| `src/features/indexing/api/tests/configQueueDataChangeContractRoutes.test.js` | KEEP | Protects emitted data-change contracts for queue retry and LLM route writes. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/indexlabRouteContext.test.js` | RETIRE | It only asserted `createIndexlabRouteContext(...)` forwarded refs and helper exposure, which is internal wiring. | Indexlab route behavior remains covered by `src/features/indexing/api/tests/indexlabRoutes.test.js`, `src/features/indexing/api/tests/queryIndexApi.test.js`, `src/features/indexing/api/tests/urlIndexApi.test.js`, `src/features/indexing/api/tests/liveCrawlApiRoute.test.js`, `src/features/indexing/api/tests/crossRunAnalyticsApi.test.js`, plus live API proof in the `src/api/tests/indexlab*.test.js` slice. | Targeted authority/indexing route proof pending in this audit pass. | Deleted. |
| `src/features/indexing/api/tests/indexlabRoutes.test.js` | KEEP | Protects run metadata and listing contracts, including archived-run readability and terminal-state projection. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/queryIndexApi.test.js` | KEEP | Protects query/prompt/url summary route contracts. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/urlIndexApi.test.js` | KEEP | Protects URL/knob snapshot route contracts. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/liveCrawlApiRoute.test.js` | KEEP | Protects live-crawl route responses and evaluation payloads. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/api/tests/crossRunAnalyticsApi.test.js` | KEEP | Protects cross-run analytics endpoints. | No replacement required. | Targeted authority/indexing route proof pending in this audit pass. | Kept unchanged. |
| `src/api/tests/indexlabAutomationQueueApi.test.js` | KEEP | Provides live server validation for the automation-queue endpoint after route-surface consolidation. | No replacement required. | Live proof pending in this audit pass. | Kept unchanged. |
| `src/api/tests/indexlabPhase07Api.test.js` | KEEP | Provides live server validation for the phase07 retrieval endpoint. | No replacement required. | Live proof pending in this audit pass. | Kept unchanged. |
| `src/api/tests/indexlabPhase08Api.test.js` | KEEP | Provides live server validation for the phase08 extraction endpoint. | No replacement required. | Live proof pending in this audit pass. | Kept unchanged. |
| `src/api/tests/indexlabSchemaPacketsApi.test.js` | KEEP | Provides live server validation for schema packet endpoints. | No replacement required. | Live proof pending in this audit pass. | Kept unchanged. |

### Proof Stack

- `node --test src/features/category-authority/api/tests/dataAuthorityRoutes.test.js src/features/indexing/api/tests/sourceStrategyCategoryScope.test.js src/features/indexing/api/tests/sourceStrategyRoutesDataChangeContract.test.js src/features/indexing/api/tests/configQueueDataChangeContractRoutes.test.js src/features/indexing/api/tests/indexlabRoutes.test.js src/features/indexing/api/tests/queryIndexApi.test.js src/features/indexing/api/tests/urlIndexApi.test.js src/features/indexing/api/tests/liveCrawlApiRoute.test.js src/features/indexing/api/tests/crossRunAnalyticsApi.test.js src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js src/features/indexing/api/tests/runtimeOpsRoutes.prefetch.test.js src/features/indexing/api/tests/runtimeOpsRoutes.workers.test.js src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js`
- Result: green, 66/66 passing on 2026-03-24.
- `node --test src/api/tests/indexlabAutomationQueueApi.test.js src/api/tests/indexlabPhase07Api.test.js src/api/tests/indexlabPhase08Api.test.js src/api/tests/indexlabSchemaPacketsApi.test.js`
- Result: green, 4/4 passing on 2026-03-24.
- `npm test`
- Result: green, 6492/6492 passing on 2026-03-24.

## Extension: Review Mutation And Discovery Orchestration Audit

### Scope

- `src/features/review/api/tests/reviewItemMutationService.characterization.test.js`
- `src/features/review/api/tests/reviewEnumMutationService.characterization.test.js`
- `src/features/review/api/tests/reviewComponentMutationService.characterization.test.js`
- `src/features/review/api/tests/reviewMutationRouteContracts.test.js`
- `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`
- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanParallel.characterization.test.js`
- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- `src/features/indexing/pipeline/orchestration/tests/schema4EmissionProof.test.js`
- `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/review/api/tests/reviewItemMutationService.characterization.test.js` | RETIRE | It asserted internal helper behavior, direct DB write args, and call wiring inside item mutation helpers instead of the public route contract. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewEnumMutationService.characterization.test.js` | RETIRE | It characterized enum helper internals, lane helper delegation, and local token utilities rather than the route contract consumers rely on. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewComponentMutationService.characterization.test.js` | RETIRE | It pinned internal component mutation helpers, collision handling, and transaction wiring instead of the route-level contract. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewMutationRouteContracts.test.js` | KEEP | Protects the public success, validation, and failure envelopes for item, enum, and component mutation routes. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js` | KEEP | Protects review route data-change emissions and user-visible route outcomes. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanParallel.characterization.test.js` | RETIRE | It locked down internal stage ordering, overlap timing, focus-group plumbing, and promotion flow details. Those are implementation details, not the orchestrator’s public contract. | Orchestration contract coverage remains in `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`, `src/features/indexing/pipeline/orchestration/tests/schema4EmissionProof.test.js`, and `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | KEEP | Protects schema 2→3→4 orchestration behavior at the returned payload boundary. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/schema4EmissionProof.test.js` | KEEP | Protects emitted Schema 4 payloads, warnings, and panel-gated behavior. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js` | KEEP | Protects the live cap guarantees that the pipeline must preserve. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |

### Proof Stack

- `node --test src/features/review/api/tests/reviewMutationRouteContracts.test.js src/features/review/api/tests/reviewRoutesDataChangeContract.test.js src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js src/features/indexing/pipeline/orchestration/tests/schema4EmissionProof.test.js src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`
- Result: green, 40/40 passing on 2026-03-24.
- `npm test`
- Result: green, 6390/6390 passing on 2026-03-24.

## Extension: Review Layout Gap-9 Audit

### Scope

- `src/features/review/domain/tests/reviewGridData.layoutCharacterization.test.js`
- `src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js`
- `src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/review/domain/tests/reviewGridData.layoutCharacterization.test.js` | RETIRE | It only asserted that review layout currently ignores `parse.unit` and `priority.publish_gate` when deriving metadata. That is an implementation snapshot, not a public contract. | Real layout behavior remains covered by `src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js` and `src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js`. | Targeted review-layout proof pending in this audit pass. | Deleted. |
| `src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js` | KEEP | Protects review layout ordering and inherited group labeling. | No replacement required. | Targeted review-layout proof pending in this audit pass. | Kept unchanged. |
| `src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js` | KEEP | Protects review consumer-gate stripping in derived layout metadata. | No replacement required. | Targeted review-layout proof pending in this audit pass. | Kept unchanged. |

### Proof Stack

- `node --test src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js`
- Result: green, 2/2 passing on 2026-03-24.
- `node --test src/features/review/domain/tests/*.test.js`
- Result: green, 126/126 passing on 2026-03-24.
- `npm test`
- Result: green, 6389/6389 passing on 2026-03-24.

## Extension: Source Planner Queue Audit

### Scope

- `src/planner/tests/sourcePlannerCharacterization.test.js`
- `src/planner/tests/sourcePlannerRouting.test.js`
- `src/planner/tests/sourcePlanner.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/planner/tests/sourcePlannerCharacterization.test.js` | COLLAPSE | The file mixed a few real queue contracts with redundant wrapper and drained-queue checks that were already covered elsewhere. The useful behavior belongs with the main planner routing suite, not in a separate characterization file. | The surviving queue contracts now live in `src/planner/tests/sourcePlannerRouting.test.js`. Broader planner behavior remains covered by `src/planner/tests/sourcePlanner.test.js`. | Targeted source-planner proof green on 2026-03-24. | Deleted after collapsing unique contracts into the routing suite. |
| `src/planner/tests/sourcePlannerRouting.test.js` | KEEP | Protects queue routing, dequeue ordering, host blocking, and candidate host-cap behavior at the planner boundary. | Expanded with the surviving queue contracts from the retired characterization file. | Targeted source-planner proof green on 2026-03-24. | Kept with stronger contract coverage. |
| `src/planner/tests/sourcePlanner.test.js` | KEEP | Protects broader brand/manufacturer seed behavior and locked-run filtering. | No replacement required. | Targeted source-planner proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/planner/tests/sourcePlannerRouting.test.js src/planner/tests/sourcePlanner.test.js`
- Result: green, 34/34 passing on 2026-03-24.
- `npm test`
- Result: green, 6384/6384 passing on 2026-03-24.

## Extension: Brand Resolver And Runtime Fast-Path Audit

### Scope

- `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js`
- `src/features/indexing/pipeline/brandResolver/tests/brandResolverStageCharacterization.test.js`
- `src/features/indexing/pipeline/brandResolver/tests/discoveryLlmAdapters.test.js`
- `src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js`
- `src/features/indexing/api/builders/tests/runListBuilder.test.js`
- `src/features/indexing/api/builders/tests/indexlabRunReadiness.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js`
- `src/features/indexing/api/tests/indexlabRoutes.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` | COLLAPSE | The file mixed return-contract assertions with helper-invocation checks (`llm.called`) that only pinned cache plumbing. Those call assertions were brittle and added no product-level protection. | Rewritten in place to assert only returned brand-resolution contracts across LLM, cache-hit, error, and storage-adapter scenarios. | Targeted brand/runtime proof green on 2026-03-24. | Kept with contract-only assertions. |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolverStageCharacterization.test.js` | KEEP | Despite the stale filename, it protects the stage boundary: returned payload shape, empty-brand behavior, and non-mutation of category-config inputs. | No replacement required. | Targeted brand/runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/brandResolver/tests/discoveryLlmAdapters.test.js` | KEEP | Protects the routed-LLM adapter contract used by brand resolution. | No replacement required. | Targeted brand/runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js` | COLLAPSE | The file combined real asset-route output checks with zero-value assertions about whether helpers were called. The missing-asset fallback test only proved internal branch selection. | Kept the route-output checks for local assets, S3-cached assets, invalid filenames, and MIME types. Retired the internal fallback-path test and removed helper-call assertions from the remaining tests. | Targeted brand/runtime proof green on 2026-03-24. | Kept with output-only assertions; one internal fallback-path test retired in place. |
| `src/features/indexing/api/builders/tests/runListBuilder.test.js` | COLLAPSE | Several tests only asserted builder factory shape or whether `materializeArchivedRunLocation` / `readEvents` were called. Those are implementation details, and the returned run rows are already protected elsewhere. | Kept the row-contract checks that verify archived/local runs, counters, sorting, limits, and metadata. Retired the pure factory and fallback-path wiring tests; removed helper-call assertions from the surviving row-contract tests. | Targeted brand/runtime proof green on 2026-03-24. | Kept with lower-brittleness coverage. |
| `src/features/indexing/api/builders/tests/indexlabRunReadiness.test.js` | KEEP | Protects returned run-list readiness, relocation, filtering, and stale-running recovery at the row boundary. | No replacement required. | Surrounding runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js` | KEEP | Protects the runtime asset route and archived-cache screenshot contracts that callers depend on. | No replacement required. | Surrounding runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/indexlabRoutes.test.js` | KEEP | Protects indexlab route contracts for relocated runs, listing, and terminal-state projection. | No replacement required. | Surrounding runtime proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/brandResolver/tests/*.test.js src/features/indexing/api/tests/runtimeOpsAssetFastPath.test.js src/features/indexing/api/builders/tests/runListBuilder.test.js`
- Result: green, 29/29 passing on 2026-03-24.
- `node --test src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js src/features/indexing/api/builders/tests/indexlabRunReadiness.test.js src/features/indexing/api/tests/indexlabRoutes.test.js`
- Result: green, 16/16 passing on 2026-03-24.
- `npm test`
- Result: green, 6380/6380 passing on 2026-03-24.

## Extension: Discover Command Wiring Audit

### Scope

- `src/app/cli/commands/tests/discoverCommandRewire.test.js`
- `src/app/cli/commands/tests/discoverCommand.test.js`
- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/cli/commands/tests/discoverCommandRewire.test.js` | RETIRE | It characterized an internal discover-command to orchestrator coupling during a rewire. The file did not protect a user-visible command contract; it only pinned the current adapter shape of `runDiscoverySeedPlan(...)`. | The real command contract remains covered by `src/app/cli/commands/tests/discoverCommand.test.js`. Orchestrator return-shape and enrichment behavior remain covered by `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`. | Targeted discover-command proof green on 2026-03-24. | Deleted. |
| `src/app/cli/commands/tests/discoverCommand.test.js` | KEEP | Protects the CLI command boundary: input filtering, run summaries, and candidate counts returned to callers. | No replacement required. | Targeted discover-command proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | KEEP | Protects the orchestrator contract for fresh result shape, `enqueue_summary`, schema handoff, and planner/query-journey wiring. | No replacement required. | Targeted discover-command proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/app/cli/commands/tests/discoverCommand.test.js`
- Result: green, 2/2 passing on 2026-03-24.
- `node --test src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- Result: green, 6/6 passing on 2026-03-24.
- `npm test`
- Result: green, 6378/6378 passing on 2026-03-24.

## Extension: Bootstrap Shape Audit

### Scope

- `src/app/api/tests/bootstrapReturnShape.characterization.test.js`
- `src/api/tests/guiServerHttpAssembly.test.js`
- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/bootstrapReturnShape.characterization.test.js` | RETIRE | It only locked a documentation constant (`BOOTSTRAP_RETURN_GROUPS`) to an exact key inventory. That constant is not consumed by runtime code, so the test protected docs parity and internal grouping, not product behavior. | Live assembly behavior remains covered by `src/api/tests/guiServerHttpAssembly.test.js` and `src/app/api/tests/guiServerRouteRegistryWiring.test.js`. | Targeted bootstrap proof green on 2026-03-24. | Deleted. |
| `src/api/tests/guiServerHttpAssembly.test.js` | KEEP | Protects the returned HTTP assembly contract. | No replacement required. | Targeted bootstrap proof green on 2026-03-24. | Kept unchanged. |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | KEEP | Protects the route parser, dispatcher, request handler, and registry pairing behavior that the GUI API actually executes. | No replacement required. | Targeted bootstrap proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/api/tests/guiServerHttpAssembly.test.js`
- Result: green, 2/2 passing on 2026-03-24.
- `node --test src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- Result: green, 5/5 passing on 2026-03-24.
- `npm test`
- Result: pending in this audit pass.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-level test-audit rules that shape the preserved historical log |
| source | `docs/05-operations/documentation-audit-ledger.md` | this file is retained as supplemental history, not current-state authority |

## Related Documents

- [Documentation Audit Ledger](../05-operations/documentation-audit-ledger.md) - explains why this historical audit file is preserved.
- [README](../README.md) - marks `docs/test-audit/` as supplemental rather than part of the active reading order.
