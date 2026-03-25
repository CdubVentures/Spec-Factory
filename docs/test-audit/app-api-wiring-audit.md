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
- `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`
- `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/review/api/tests/reviewItemMutationService.characterization.test.js` | RETIRE | It asserted internal helper behavior, direct DB write args, and call wiring inside item mutation helpers instead of the public route contract. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewEnumMutationService.characterization.test.js` | RETIRE | It characterized enum helper internals, lane helper delegation, and local token utilities rather than the route contract consumers rely on. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewComponentMutationService.characterization.test.js` | RETIRE | It pinned internal component mutation helpers, collision handling, and transaction wiring instead of the route-level contract. | Public mutation envelopes and failure contracts are covered by `src/features/review/api/tests/reviewMutationRouteContracts.test.js`. Data-change behavior remains covered by `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/review/api/tests/reviewMutationRouteContracts.test.js` | KEEP | Protects the public success, validation, and failure envelopes for item, enum, and component mutation routes. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js` | KEEP | Protects review route data-change emissions and user-visible route outcomes. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanParallel.characterization.test.js` | RETIRE | It locked down internal stage ordering, overlap timing, focus-group plumbing, and promotion flow details. Those are implementation details, not the orchestrator’s public contract. | Orchestration contract coverage remains in `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`, `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`, and `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`. | Targeted review/orchestration proof pending in this audit pass. | Deleted. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | KEEP | Protects NeedSet→planning-context→search-plan orchestration behavior at the returned payload boundary. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js` | KEEP | Protects emitted search-plan payloads, warnings, and panel-gated behavior. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |
| `src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js` | KEEP | Protects the live cap guarantees that the pipeline must preserve. | No replacement required. | Targeted review/orchestration proof pending in this audit pass. | Kept unchanged. |

### Proof Stack

- `node --test src/features/review/api/tests/reviewMutationRouteContracts.test.js src/features/review/api/tests/reviewRoutesDataChangeContract.test.js src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js src/features/indexing/pipeline/tests/pipelineCapEnforcement.test.js`
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
- Result: green, 6163/6163 passing on 2026-03-24.

## Extension: Config Surface And Manifest Codegen Audit

### Scope

- `src/core/config/tests/configCharacterization.test.js`
- `src/core/config/tests/configValidation.test.js`
- `src/core/config/tests/llmConfigReadSurface.test.js`
- `src/core/config/tests/configFromSnapshotContract.test.js`
- `tools/gui-react/scripts/generateManifestTypes.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/core/config/tests/configCharacterization.test.js` | COLLAPSE | The file mixed real config surface checks with a repeated-load key-shape assertion and duplicated internal-map numeric policing. Those assertions only locked the current object layout, not a meaningful runtime contract. | Rewritten in place to keep the returned config surface, override behavior, resolved aliasing, and retired-key absence, while deleting the repeated-shape and duplicate map-shape checks. | Targeted config proof green on 2026-03-24. | Kept with lower-brittleness contract coverage. |
| `src/core/config/tests/configValidation.test.js` | COLLAPSE | It contained a duplicate `discoveryEnabled` default assertion already covered by the adjacent default-config test in the same file. | Duplicate assertion deleted in place; validation and normalization coverage remains unchanged. | Targeted config proof green on 2026-03-24. | Kept with duplicate default coverage removed. |
| `src/core/config/tests/llmConfigReadSurface.test.js` | KEEP | Protects the real read-surface contract for retired LLM keys across settings maps, defaults, clamping, and env metadata. | No replacement required. | Targeted config proof green on 2026-03-24. | Kept unchanged. |
| `src/core/config/tests/configFromSnapshotContract.test.js` | KEEP | Protects snapshot overlay behavior and alias remapping on the consumer-facing config surface. | No replacement required. | Targeted config proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/scripts/generateManifestTypes.test.js` | COLLAPSE | The file hardcoded a retired named enum export (`RuntimeRepairDedupeRule`) even though the generator’s current public output no longer emits named enum unions. That assertion only pinned stale codegen internals. | Rewritten in place to assert the generated interface never references undeclared custom types and that retired enum aliases stay absent. | Targeted codegen proof green on 2026-03-24. | Kept with contract-driven output assertions. |

### Proof Stack

- `node --test src/core/config/tests/configCharacterization.test.js src/core/config/tests/configValidation.test.js src/core/config/tests/llmConfigReadSurface.test.js src/core/config/tests/configFromSnapshotContract.test.js`
- Result: green, 39/39 passing on 2026-03-24.
- `node --test src/core/config/tests/*.test.js`
- Result: green, 136/136 passing on 2026-03-24.
- `node --test tools/gui-react/scripts/generateManifestTypes.test.js`
- Result: green, 13/13 passing on 2026-03-24.
- `npm test`
- Result: green, 6163/6163 passing on 2026-03-24.

## Extension: Page Registry And Automation Queue Audit

### Scope

- `tools/gui-react/src/registries/__tests__/pageRegistryContract.test.js`
- `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`
- `src/features/indexing/api/builders/tests/automationQueueBuilder.test.js`
- `src/features/indexing/api/contracts/tests/automationQueueShapeContract.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/gui-react/src/registries/__tests__/pageRegistryContract.test.js` | COLLAPSE | The file hardcoded page counts and a golden-master inventory of labels and paths. Those assertions only protected the current navigation layout and broke on legitimate page additions or regrouping. | Rewritten in place to keep the real derivation contract: registry entry shape, uniqueness, tab-group validity, metadata preservation, and tab/route derivation from `PAGE_REGISTRY`. User-visible tab grouping stays covered by `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`. | Targeted registry/nav proof green on 2026-03-24. | Kept with hardcoded inventory assertions retired. |
| `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js` | KEEP | Protects the rendered navigation grouping and active-tab surface that users actually see. | No replacement required. | Targeted registry/nav proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/automationQueueBuilder.test.js` | COLLAPSE | It included a builder-factory shape assertion and a duplicate top-level envelope-key test already covered by the dedicated automation queue contract suite. Those assertions pinned object construction details rather than additional runtime behavior. | Retired the builder-shape and duplicate envelope checks in place. Behavioral job-state, deficit, action-history, and summary tests remain. Envelope key coverage stays in `src/features/indexing/api/contracts/tests/automationQueueShapeContract.test.js`. | Targeted automation-queue proof green on 2026-03-24. | Kept with duplicate implementation-coupled assertions removed. |
| `src/features/indexing/api/contracts/tests/automationQueueShapeContract.test.js` | KEEP | Protects the canonical automation queue response, job, action, and summary key surfaces. | No replacement required. | Targeted automation-queue proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test tools/gui-react/src/registries/__tests__/pageRegistryContract.test.js tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`
- Result: green, 18/18 passing on 2026-03-24.
- `node --test tools/gui-react/src/registries/__tests__/*.test.js`
- Result: green, 16/16 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/automationQueueBuilder.test.js src/features/indexing/api/contracts/tests/automationQueueShapeContract.test.js`
- Result: green, 18/18 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/automationQueue*.test.js`
- Result: green, 30/30 passing on 2026-03-24.
- `npm test`
- Result: green, 5970/5970 passing on 2026-03-24.

## Extension: Domain Checklist And Evidence Index Builder Audit

### Scope

- `src/features/indexing/api/builders/tests/domainChecklistBuilder.test.js`
- `src/features/indexing/api/builders/tests/evidenceIndexReader.test.js`
- `src/api/tests/evidenceSearchEndpoint.test.js`
- `src/api/tests/phase06AEvidenceIndex.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/api/builders/tests/domainChecklistBuilder.test.js` | COLLAPSE | The file included a pure builder-factory assertion that only pinned object construction. That added no behavior coverage beyond the returned checklist rows and evidence summaries already asserted in the same file. | Retired the factory-shape assertion in place. Category guards, run resolution, event filtering, domain buckets, repair query dedupe, provenance cross-reference, and top-level checklist surface remain covered in the same suite. | Targeted checklist/evidence proof green on 2026-03-24. | Kept with zero-value factory coverage removed. |
| `src/features/indexing/api/builders/tests/evidenceIndexReader.test.js` | COLLAPSE | The file included a pure builder-factory assertion that only proved the reader object exposed a method. The meaningful protection is the returned evidence-index contract. | Retired the factory-shape assertion in place. Null guards, skeleton fallback, scope selection, summary rows, search mapping, and dedupe stream behavior remain covered in the same suite. | Targeted checklist/evidence proof green on 2026-03-24. | Kept with zero-value factory coverage removed. |
| `src/api/tests/evidenceSearchEndpoint.test.js` | KEEP | Protects the evidence search API response contract at the route boundary. | No replacement required. | Surrounding checklist/evidence proof green on 2026-03-24. | Kept unchanged. |
| `src/api/tests/phase06AEvidenceIndex.test.js` | KEEP | Protects persisted evidence indexing, dedupe, and lookup behavior that the reader and API surface depend on. | No replacement required. | Surrounding checklist/evidence proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/api/builders/tests/domainChecklistBuilder.test.js src/features/indexing/api/builders/tests/evidenceIndexReader.test.js`
- Result: green, 24/24 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/domainChecklistBuilder.test.js src/features/indexing/api/builders/tests/evidenceIndexReader.test.js src/api/tests/evidenceSearchEndpoint.test.js src/api/tests/phase06AEvidenceIndex.test.js`
- Result: green, 46/46 passing on 2026-03-24.
- `npm test`
- Result: green, 6045/6045 passing on 2026-03-24.

## Extension: Need-Set Contract Collapse Audit

### Scope

- `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js`
- `src/indexlab/tests/phase01NeedSetEngine.contracts.test.js`
- `src/indexlab/tests/phase01NeedSetEngine.schema2-shape.test.js`
- `src/indexlab/tests/phase01NeedSetEngine.state-model.test.js`
- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js` | COLLAPSE | The file repeated the same success contract in three places and labeled public-contract checks as golden-master characterization. Two assertions only checked that `focusGroups` existed as an array and that `seedStatus` existed, which was too weak to justify the duplicate surface. | Rewritten in place to keep input-validation guards, failure-path empty-contract behavior, and public return assertions for grouped unresolved fields, seed-status surface, and planner handoff payload. | Targeted need-set proof green on 2026-03-24. | Kept with duplicate success and characterization noise removed. |
| `src/indexlab/tests/phase01NeedSetEngine.contracts.test.js` | COLLAPSE | The file restated summary-to-row count math and top-level key presence already covered by the stronger schema2-shape and state-model suites. Those assertions only duplicated existing contract coverage through another file. | Retired the duplicate count and top-level key assertions in place. The file still protects legacy-field removal, debug identity passthrough, and runtime-bridge needset event/artifact contracts. | Targeted need-set proof green on 2026-03-24. | Kept with duplicate contract coverage removed. |
| `src/indexlab/tests/phase01NeedSetEngine.schema2-shape.test.js` | KEEP | Protects the canonical schema2 output surface for top-level fields, identity block, planner seed, summary, blockers, and per-field entries. | No replacement required. | Targeted need-set proof green on 2026-03-24. | Kept unchanged. |
| `src/indexlab/tests/phase01NeedSetEngine.state-model.test.js` | KEEP | Protects state derivation, bundle formation, focus-field ordering, summary counts, row ordering, and edge-case behavior. | No replacement required. | Targeted need-set proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | KEEP | Protects the orchestrator return contract, schema handoff attachment, planner wiring, and fresh-result enrichment. | No replacement required. | Surrounding need-set proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js` | KEEP | Protects emitted needset/search-plan payload contracts at the orchestration boundary. | No replacement required. | Surrounding need-set proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js src/indexlab/tests/phase01NeedSetEngine.contracts.test.js src/indexlab/tests/phase01NeedSetEngine.schema2-shape.test.js src/indexlab/tests/phase01NeedSetEngine.state-model.test.js`
- Result: green, 67/67 passing on 2026-03-24.
- `node --test src/indexlab/tests/phase01NeedSetEngine*.test.js src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`
- Result: green, 157/157 passing on 2026-03-24.
- `npm test`
- Result: green, 6045/6045 passing on 2026-03-24.

## Extension: Runtime-Ops Badge Registry Audit

### Scope

- `tools/gui-react/src/features/runtime-ops/__tests__/badgeRegistries.test.ts`
- `tools/gui-react/src/features/runtime-ops/__tests__/poolStageHelpers.test.ts`
- `tools/gui-react/src/features/runtime-ops/__tests__/poolStageRegistry.test.ts`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/gui-react/src/features/runtime-ops/__tests__/badgeRegistries.test.ts` | COLLAPSE | The file was a golden-master of helper wrappers that simply forwarded to badge registries. It locked exact class strings for every helper variant and duplicated registry behavior through an extra layer with no additional user-visible protection. | Rewritten in place to assert the badge registry contract directly: visible labels, severity-family mapping, neutral fallbacks, need-set badge fallbacks, and prefetch badge helpers. Thin helper-forwarding coverage was retired. | Targeted runtime-ops badge proof green on 2026-03-24. | Kept with registry-first contract coverage. |
| `tools/gui-react/src/features/runtime-ops/__tests__/poolStageHelpers.test.ts` | RETIRE | It only reasserted `resolvePoolStage(...)` through helper wrappers such as `poolBadgeClass(...)` and `stageLabel(...)`. That was pure forwarding duplication and protected refactor shape, not behavior beyond the registry contract. | Pool/stage behavior remains covered by `tools/gui-react/src/features/runtime-ops/__tests__/poolStageRegistry.test.ts`. | Targeted runtime-ops badge proof green on 2026-03-24. | Deleted. |
| `tools/gui-react/src/features/runtime-ops/__tests__/poolStageRegistry.test.ts` | KEEP | Protects the canonical pool-stage registry surface, key inventory, and fallback object shape used by the runtime-ops UI. | No replacement required. | Targeted runtime-ops badge proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test tools/gui-react/src/features/runtime-ops/__tests__/badgeRegistries.test.ts tools/gui-react/src/features/runtime-ops/__tests__/poolStageRegistry.test.ts`
- Result: green, 142/142 passing on 2026-03-24.
- `node --test tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts`
- Result: green, 142/142 passing on 2026-03-24.
- `npm test`
- Result: green, 5905/5905 passing on 2026-03-24.

## Extension: Shared Registry Derivations Audit

### Scope

- `src/shared/tests/settingsRegistryDerivations.test.js`
- `src/shared/tests/settingsRegistryCompleteness.test.js`
- `src/shared/tests/settingsRegistryTransportContract.test.js`
- `src/shared/tests/uiRegistryDerivations.test.js`
- `src/shared/tests/storageRegistryDerivations.test.js`
- `src/shared/tests/miscGroupDerivationContract.test.js`
- `src/shared/tests/deriveManifestGroups.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/shared/tests/settingsRegistryDerivations.test.js` | COLLAPSE | The file contained a second golden-master block that restated full default derivation coverage already proven earlier in the same suite. It also carried a stale alias assertion for a removed fallback token entry. | Rewritten in place to keep the exact defaults, clamping, route-map, alias, and deprecation contracts, while replacing the duplicate golden-master block with a direct `deriveOptionValues(...)` contract against the runtime option-values surface. | Targeted shared-registry proof green on 2026-03-24. | Kept with duplicate defaults golden-master coverage removed. |
| `src/shared/tests/settingsRegistryCompleteness.test.js` | KEEP | Protects UI metadata and derived category completeness for runtime settings. | No replacement required. | Targeted shared-registry proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/settingsRegistryTransportContract.test.js` | KEEP | Protects config-key and env-key transport maps derived from registry metadata. | No replacement required. | Targeted shared-registry proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/uiRegistryDerivations.test.js` | KEEP | Protects the UI settings derivation surface used by the client store. | No replacement required. | Surrounding shared-registry proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/storageRegistryDerivations.test.js` | KEEP | Protects the storage settings derivation surface, including clear flags and secret-presence maps. | No replacement required. | Surrounding shared-registry proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/miscGroupDerivationContract.test.js` | KEEP | Protects manifest entry derivation for runtime env-key exports. | No replacement required. | Surrounding shared-registry proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/deriveManifestGroups.test.js` | KEEP | Protects group derivation and manifest grouping shape for registry-driven exports. | No replacement required. | Surrounding shared-registry proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/shared/tests/settingsRegistryDerivations.test.js src/shared/tests/settingsRegistryCompleteness.test.js src/shared/tests/settingsRegistryTransportContract.test.js`
- Result: green, 52/52 passing on 2026-03-24.
- `node --test src/shared/tests/settingsRegistry*.test.js src/shared/tests/uiRegistryDerivations.test.js src/shared/tests/storageRegistryDerivations.test.js src/shared/tests/miscGroupDerivationContract.test.js src/shared/tests/deriveManifestGroups.test.js`
- Result: green, 106/106 passing on 2026-03-24.
- `npm test`
- Result: green, 5906/5906 passing on 2026-03-24.

## Extension: Search Profile Tier Data Flow Audit

### Scope

- `src/indexlab/tests/searchProfileTierDataFlow.test.js`
- `src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js`
- `src/features/indexing/api/builders/tests/runtimeOpsSearchProfileMergeHelpers.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/indexlab/tests/searchProfileTierDataFlow.test.js` | COLLAPSE | The file mixed stale "Phase 1/Phase 2" characterization scaffolding with duplicate status assertions and repeated tier-field spot checks. It also imported `mergeSearchProfileRows` without using it. | Rewritten in place as a compact contract suite covering legacy row preservation, tier metadata preservation for key-search rows, safe tier defaults, and caller-owned versus derived status behavior in `refreshSearchProfileCollections(...)`. | Targeted search-profile proof green on 2026-03-24. | Kept with duplicate characterization noise removed. |
| `src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js` | KEEP | Protects on-disk search-profile artifact updates and event-driven runtime bridge behavior. | No replacement required. | Surrounding search-profile proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/runtimeOpsSearchProfileMergeHelpers.test.js` | KEEP | Protects the query merge contract that enriches and deduplicates search-profile rows downstream. | No replacement required. | Surrounding search-profile proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live runtime validation that prefetch/search-profile wiring still produces populated search-profile artifacts after the collapse. | No replacement required. | Live validation green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/indexlab/tests/searchProfileTierDataFlow.test.js src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js src/features/indexing/api/builders/tests/runtimeOpsSearchProfileMergeHelpers.test.js`
- Result: green, 47/47 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 1/1 passing on 2026-03-24.
- `npm test`
- Result: green, 5906/5906 passing on 2026-03-24.

## Extension: Result Processing SERP/Profile Audit

### Scope

- `src/features/indexing/pipeline/resultProcessing/tests/helpers/triageCharacterizationHarness.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.serp-shape.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.result-contract.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.instrumentation.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.filtering.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorIntegration.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorFallback.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.serp-shape.test.js` | COLLAPSE | The file repeated broad key-inventory checks and count spot checks across `serp_explorer` and `search_profile` payloads. It mostly protected incidental field scatter instead of the public result-processing contract. | Rewritten in place as two contract tests that assert funnel counts, normalized query stats, embedded SERP explorer counts, and query candidate aggregation. Shared setup now comes from `makeProcessDiscoveryResultsArgs(...)` in `triageCharacterizationHarness.js`. | Targeted result-processing proof green on 2026-03-24. | Kept with duplicate shape policing removed. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.result-contract.test.js` | KEEP | Protects the public result payload envelope and the normalized discovery-output contract returned by result processing. | No replacement required. | Targeted result-processing proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.instrumentation.test.js` | KEEP | Protects emitted instrumentation events and reason-code behavior that downstream runtime tooling consumes. | No replacement required. | Targeted result-processing proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.filtering.test.js` | KEEP | Protects observable filtering and safety classification outcomes for ranked candidates. | No replacement required. | Targeted result-processing proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorIntegration.test.js` | KEEP | Protects the selector integration contract that chooses the public SERP view from processed candidates. | No replacement required. | Surrounding result-processing proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorFallback.test.js` | KEEP | Protects the fallback contract when selector/reranker inputs degrade and the pipeline must still emit usable SERP output. | No replacement required. | Surrounding result-processing proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live runtime validation that the prefetch path still emits populated SERP/search-profile artifacts after the collapse. | No replacement required. | Live validation green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.*.test.js`
- Result: green, 9/9 passing on 2026-03-24.
- `node --test src/features/indexing/pipeline/resultProcessing/tests/*.test.js`
- Result: green, 88/88 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 1/1 passing on 2026-03-24.
- `npm test`
- Result: green, 5888/5888 passing on 2026-03-24.

## Extension: Studio Shape Alignment Audit

### Scope

- `src/features/studio/contracts/tests/studioShapeAlignment.test.js`
- `src/features/studio/api/tests/studioComponentDbAuthorityContracts.test.js`
- `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js`
- `src/features/studio/api/tests/studioKnownValuesAuthorityContracts.test.js`
- `tools/gui-react/src/features/studio/state/__tests__/studioPageControllerContracts.test.js`
- `tools/gui-react/src/features/studio/state/__tests__/studioPageDerivedState.contracts.test.js`
- `tools/gui-react/src/features/studio/state/__tests__/studioPagePanelPropsContracts.test.js`
- `tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/studio/contracts/tests/studioShapeAlignment.test.js` | RETIRE | The file parsed `tools/gui-react/src/types/studio.ts` as raw text and asserted interface key presence. That protected interface layout and file placement rather than runtime behavior, and it would fail on harmless type refactors. | Runtime protection remains anchored on studio route contracts plus GUI query/panel contracts: `studioFieldStudioMapContracts.test.js`, `studioKnownValuesAuthorityContracts.test.js`, `studioComponentDbAuthorityContracts.test.js`, `studioPageControllerContracts.test.js`, `studioPageDerivedState.contracts.test.js`, `studioPagePanelPropsContracts.test.js`, and `studioPageActivePanelContracts.test.js`. | Targeted studio proof green on 2026-03-24. | Deleted. |
| `src/features/studio/api/tests/studioComponentDbAuthorityContracts.test.js` | KEEP | Protects the authoritative component-db success/failure contract at the API boundary. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js` | KEEP | Protects field-studio-map read/write behavior, destructive-overwrite guardrails, and propagation events. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `src/features/studio/api/tests/studioKnownValuesAuthorityContracts.test.js` | KEEP | Protects the authoritative known-values success/failure contract at the API boundary. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/studio/state/__tests__/studioPageControllerContracts.test.js` | KEEP | Protects the GUI query contract for studio payload, tooltip-bank, artifacts, known-values, component-db, and map mutation wiring. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/studio/state/__tests__/studioPageDerivedState.contracts.test.js` | KEEP | Protects derived studio behavior from real response payloads, including tooltip-bank and known-values error handling. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/studio/state/__tests__/studioPagePanelPropsContracts.test.js` | KEEP | Protects artifact normalization and panel-prop shaping at the GUI boundary. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js` | KEEP | Protects user-visible panel routing and the known-values warning/mapping-tab contract. | No replacement required. | Targeted studio proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/studio/api/tests/*.test.js tools/gui-react/src/features/studio/state/__tests__/*.test.js tools/gui-react/src/features/studio/components/__tests__/*.test.js`
- Result: green, 71/71 passing on 2026-03-24.
- `npm test`
- Result: green, 5888/5888 passing on 2026-03-24.

## Extension: Review Shape Alignment Audit

### Scope

- `src/features/review/contracts/tests/reviewShapeAlignment.test.js`
- `src/features/review/contracts/tests/componentReviewShapeAlignment.test.js`
- `src/features/review/api/tests/reviewLaneApiContracts.test.js`
- `src/features/review/api/tests/reviewMutationRouteContracts.test.js`
- `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`
- `src/features/review/domain/tests/*.test.js`
- `tools/gui-react/src/pages/component-review/__tests__/enumReviewStore.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/review/contracts/tests/reviewShapeAlignment.test.js` | RETIRE | The file parsed `tools/gui-react/src/types/review.ts` as raw text and asserted interface key presence. That protected type-file layout rather than runtime review behavior, and it would fail on harmless TypeScript refactors. | Runtime protection remains anchored on review lane/mutation/data-change route contracts, review domain payload/layout/state contracts, and the enum review store query contract. | Targeted review proof green on 2026-03-24. | Deleted. |
| `src/features/review/contracts/tests/componentReviewShapeAlignment.test.js` | RETIRE | The file parsed `tools/gui-react/src/types/componentReview.ts` as raw text and asserted interface key presence. It duplicated no live runtime contract and only guarded source layout. | Runtime protection remains anchored on review lane/mutation/data-change route contracts, component-review domain payload/layout/state contracts, and the enum review store query contract. | Targeted review proof green on 2026-03-24. | Deleted. |
| `src/features/review/api/tests/reviewLaneApiContracts.test.js` | KEEP | Protects lane-specific review request/response behavior and mutation isolation at the API boundary. | No replacement required. | Targeted review proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/api/tests/reviewMutationRouteContracts.test.js` | KEEP | Protects public success/error envelopes for review mutation routes. | No replacement required. | Targeted review proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js` | KEEP | Protects typed data-change event emission for review routes. | No replacement required. | Targeted review proof green on 2026-03-24. | Kept unchanged. |
| `src/features/review/domain/tests/*.test.js` | KEEP | Protects review payload shaping, layout derivation, cascade behavior, override workflows, queue/websocket behavior, and review-state invariants through runtime-facing domain contracts. | No replacement required. | Surrounding review proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/pages/component-review/__tests__/enumReviewStore.test.js` | KEEP | Protects the GUI enum-review query/invalidation contract that consumes the runtime review payloads. | No replacement required. | Targeted review proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/review/api/tests/*.test.js src/features/review/domain/tests/*.test.js tools/gui-react/src/pages/component-review/__tests__/*.test.js`
- Result: green, 170/170 passing on 2026-03-24.
- `npm test`
- Result: green, 5869/5869 passing on 2026-03-24.

## Extension: App Runtime Shape Alignment Audit

### Scope

- `src/app/api/contracts/tests/eventsShapeAlignment.test.js`
- `src/app/api/contracts/tests/runtimeTypeShapeAlignment.test.js`
- `src/api/tests/*.test.js`
- `src/app/api/tests/*.test.js`
- `src/app/api/routes/tests/*.test.js`
- `tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts`
- `tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js`
- `tools/gui-react/src/features/indexing/state/__tests__/indexingRunStateContracts.test.js`
- `tools/gui-react/src/features/studio/state/__tests__/studioPageControllerContracts.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/contracts/tests/eventsShapeAlignment.test.js` | RETIRE | The file parsed `tools/gui-react/src/types/events.ts` as raw text and asserted `ProcessStatus` interface keys. That protected TypeScript source layout rather than the runtime process-status contract. | Runtime protection remains anchored on process/runtime route tests, GUI endpoint/event-model contracts, and UI process-status consumers in `indexingRunStateContracts.test.js` and `studioPageControllerContracts.test.js`. | Targeted app/runtime proof green on 2026-03-24. | Deleted. |
| `src/app/api/contracts/tests/runtimeTypeShapeAlignment.test.js` | RETIRE | The file parsed `tools/gui-react/src/types/runtime.ts` as raw text and asserted runtime trace/frontier interface keys. It protected type-file layout, not runtime payload behavior. | Runtime protection remains anchored on GUI endpoint/event-model contracts plus runtime-ops badge/stage-group contracts that consume the runtime trace/frontier/LLM payload surfaces. | Targeted app/runtime proof green on 2026-03-24. | Deleted. |
| `src/api/tests/*.test.js` | KEEP | Protects GUI endpoint payloads, event-model contracts, review runtime behavior, and API-visible evidence/indexing surfaces. | No replacement required. | Surrounding app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/app/api/tests/*.test.js` | KEEP | Protects process runtime, realtime bridge, specdb runtime, searxng runtime, and GUI route registration behavior. | No replacement required. | Surrounding app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `src/app/api/routes/tests/*.test.js` | KEEP | Protects infra/process/test-mode route contracts at the request/response boundary. | No replacement required. | Surrounding app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts` | KEEP | Protects runtime-ops badge registry contracts consumed by the UI. | No replacement required. | Targeted app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js` | KEEP | Protects stage-group and shared runtime-ops panel contracts that consume runtime payloads. | No replacement required. | Targeted app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/indexing/state/__tests__/indexingRunStateContracts.test.js` | KEEP | Protects GUI process-status consumption and refresh behavior. | No replacement required. | Targeted app/runtime proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/studio/state/__tests__/studioPageControllerContracts.test.js` | KEEP | Protects studio-side process-status mutation/query behavior that consumes the same runtime status contract. | No replacement required. | Targeted app/runtime proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/api/tests/*.test.js src/app/api/tests/*.test.js src/app/api/routes/tests/*.test.js tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js tools/gui-react/src/features/indexing/state/__tests__/indexingRunStateContracts.test.js tools/gui-react/src/features/studio/state/__tests__/studioPageControllerContracts.test.js`
- Result: green, 387/387 passing on 2026-03-24.
- `npm test`
- Result: green, 5865/5865 passing on 2026-03-24.

## Extension: Catalog Shape Alignment Audit

### Scope

- `src/features/catalog/contracts/tests/catalogShapeAlignment.test.js`
- `src/features/catalog/contracts/tests/productShapeAlignment.test.js`
- `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js`
- `tools/gui-react/src/features/catalog/api/__tests__/catalogParsers.test.ts`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/catalog/contracts/tests/catalogShapeAlignment.test.js` | RETIRE | The file parsed generated TypeScript sources and asserted interface key presence, including a negative check on interface field leakage. That protected source layout rather than the runtime catalog contract. | Runtime protection remains anchored on catalog/brand route contracts and the frontend parser boundary in `catalogParsers.test.ts`. | Targeted catalog proof green on 2026-03-24. | Deleted. |
| `src/features/catalog/contracts/tests/productShapeAlignment.test.js` | RETIRE | The file parsed `product.generated.ts` and `product.ts` as raw text to assert interface keys for summary/queue/brand result types. It was another pure source-layout guard with no runtime behavior. | Runtime protection remains anchored on catalog/brand route contracts and the frontend parser boundary in `catalogParsers.test.ts`. | Targeted catalog proof green on 2026-03-24. | Deleted. |
| `src/features/catalog/api/tests/catalogBrandPropagationRoutes.test.js` | KEEP | Protects catalog and brand route behavior: SpecDb propagation, queue cleanup, detail fallback, rename plumbing, and typed data-change emission. | No replacement required. | Targeted catalog proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/catalog/api/__tests__/catalogParsers.test.ts` | KEEP | Protects the frontend catalog parser boundary that consumes catalog row/product payload arrays. | No replacement required. | Targeted catalog proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/catalog/api/tests/*.test.js tools/gui-react/src/features/catalog/api/__tests__/*.test.ts`
- Result: green, 19/19 passing on 2026-03-24.
- `npm test`
- Result: green, 5857/5857 passing on 2026-03-24.

## Extension: Indexing API Type Alignment Audit

### Scope

- `src/features/indexing/api/contracts/tests/automationQueueTypeAlignment.test.js`
- `src/features/indexing/api/contracts/tests/runtimeOpsTypeAlignment.test.js`
- `src/features/indexing/api/contracts/tests/*.test.js`
- `src/features/indexing/api/builders/tests/automationQueueBuilder.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js`
- `src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js`
- `src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js`
- `tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts`
- `tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/api/contracts/tests/automationQueueTypeAlignment.test.js` | RETIRE | The file parsed frontend TypeScript sources and duplicated a local interface parser just to assert key presence. That protected type-file layout, not the automation queue runtime contract. | Runtime protection remains anchored on `automationQueueShapeContract.test.js`, `automationQueueBuilder.test.js`, and the automation queue route/GUI consumers. | Targeted indexing API proof green on 2026-03-24. | Deleted. |
| `src/features/indexing/api/contracts/tests/runtimeOpsTypeAlignment.test.js` | RETIRE | The file parsed runtime-ops TypeScript sources and duplicated source-level key alignment across many interfaces. It was broad source-layout policing rather than runtime behavior protection. | Runtime protection remains anchored on `runtimeOpsShapeContract.test.js`, `prefetchContract.test.js`, runtime-ops builder/route tests, and runtime-ops UI registry/stage-group contracts. | Targeted indexing API proof green on 2026-03-24. | Deleted. |
| `src/features/indexing/api/contracts/tests/*.test.js` | KEEP | Protects automation queue, prefetch, and runtime-ops response shapes at the runtime contract boundary. | No replacement required. | Surrounding indexing API proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/automationQueueBuilder.test.js` | KEEP | Protects automation queue builder behavior and summary/job/action derivation. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js` | KEEP | Protects runtime-ops asset route behavior and readable run/runtime artifact contracts. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js` | KEEP | Protects runtime-ops lifecycle/readability behavior for live, relocated, and stale runs. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js` | KEEP | Protects phase-132 route contracts for extraction, fallbacks, and queue endpoints. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts` | KEEP | Protects runtime-ops UI registry/badge contracts that consume runtime-ops payloads. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js` | KEEP | Protects shared stage-group UI contracts that consume runtime-ops payloads. | No replacement required. | Targeted indexing API proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/api/contracts/tests/*.test.js src/features/indexing/api/builders/tests/automationQueueBuilder.test.js src/features/indexing/api/tests/runtimeOpsRoutes.assets.test.js src/features/indexing/api/tests/runtimeOpsRoutes.lifecycle.test.js src/features/indexing/api/tests/runtimeOpsPhase132Routes.test.js tools/gui-react/src/features/runtime-ops/__tests__/*.test.ts tools/gui-react/src/features/runtime-ops/panels/shared/__tests__/*.test.js`
- Result: green, 277/277 passing on 2026-03-24.
- `npm test`
- Result: green, 5824/5824 passing on 2026-03-24.

## Extension: Config Manifest Guard Audit

### Scope

- `src/core/config/tests/manifestStructuralGuard.test.js`
- `src/core/config/tests/*.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/core/config/tests/manifestStructuralGuard.test.js` | COLLAPSE | One assertion enforced omission of currently empty manifest groups (`core`, `storage`, `caching`, `security`). That was a policy/layout guard, not a public config contract. | Rewritten in place to keep version, shape, key/default alignment, uniqueness, and `LOCAL_OUTPUT_ROOT` contract checks while retiring the omission-policy assertion. | Targeted config proof green on 2026-03-24. | Kept with policy-only omission check removed. |
| `src/core/config/tests/*.test.js` | KEEP | Protects config resolution, validation, registry drift, runtime snapshot transport, and manifest-backed default behavior. | No replacement required. | Surrounding config proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/core/config/tests/*.test.js`
- Result: green, 131/131 passing on 2026-03-24.
- `npm test`
- Result: green, 5823/5823 passing on 2026-03-24.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-level test-audit rules that shape the preserved historical log |
| source | `docs/05-operations/documentation-audit-ledger.md` | this file is retained as supplemental history, not current-state authority |

## Related Documents

- [Documentation Audit Ledger](../05-operations/documentation-audit-ledger.md) - explains why this historical audit file is preserved.
- [README](../README.md) - marks `docs/test-audit/` as supplemental rather than part of the active reading order.

## Extension: Shared Settings Defaults / Env Sync Audit

### Scope

- `src/shared/tests/settingsDefaultsEnvSync.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`
- `src/features/settings-authority/tests/settingsContract.test.js`
- `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`
- `src/core/config/tests/*.test.js`
- `src/core/config/tests/manifestRegistryDriftGuard.test.js`
- `src/core/config/tests/manifestStructuralGuard.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/shared/tests/settingsDefaultsEnvSync.test.js` | COLLAPSE | The file mixed one real default-ownership contract with duplicate one-off fallback checks, internal `SETTINGS_DEFAULTS.runtime` retirement policing, and repo `.env` file scanners that depended on local workspace artifacts. Those assertions protected implementation scatter and developer-local file contents more than public behavior. | Rewritten in place to keep one default-owner contract plus one public retirement contract over `RUNTIME_SETTINGS_KEYS`, `loadConfig()`, and `CONFIG_MANIFEST_KEYS`. Runtime/API/config protection also remains in `src/shared/tests/runtimeSettingsApi.test.js`, `src/features/settings-authority/tests/settingsContract.test.js`, `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`, `src/core/config/tests/configValidation.test.js`, `src/core/config/tests/manifestRegistryDriftGuard.test.js`, and `src/core/config/tests/manifestStructuralGuard.test.js`. | Targeted shared settings + config proof green on 2026-03-24. | Kept with duplicate/default-bag/env-file assertions removed. |

### Proof Stack

- `node --test src/shared/tests/settingsDefaultsEnvSync.test.js src/shared/tests/runtimeSettingsApi.test.js src/features/settings-authority/tests/settingsContract.test.js src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`
- Result: green, 22/22 passing on 2026-03-24.
- `node --test src/core/config/tests/*.test.js`
- Result: green, 131/131 passing on 2026-03-24.
- `npm test`
- Result: green, 5809/5809 passing on 2026-03-24.

## Extension: Brand / Search Profile Wrapper Audit

### Scope

- `src/features/indexing/pipeline/brandResolver/tests/brandResolverStageCharacterization.test.js`
- `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js`
- `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js`
- `src/features/indexing/search/tests/queryBuilderCharacterization.test.js`
- `src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js`
- `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js`
- `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolverStageCharacterization.test.js` | COLLAPSE | The file duplicated the same success/null branches multiple ways and asserted category-config non-mutation, which was implementation policing rather than public stage output. | Rewritten in place to keep only the returned `brandResolution` contract for success, missing-brand, and resolver-failure cases. Resolution normalization and alias-driven search behavior remain covered by `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js`. | Targeted brand/search-profile proof green on 2026-03-24. | Kept with duplicate and side-effect assertions removed. |
| `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js` | COLLAPSE | The file mainly asserted logger emissions and fallback warnings while repeating query-shape coverage already owned by the search-profile builder suite. That pinned wrapper internals instead of the returned contract. | Rewritten in place to keep one return-only wrapper contract asserting the public `searchProfileBase` payload and the configured query-cap boundary. Runtime handling of `search_profile_generated` now stays covered by `src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js`. | Targeted brand/search-profile proof green on 2026-03-24. | Kept with logger-side-effect assertions removed. |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` | KEEP | Protects normalized resolver output, cache hits, empty-resolution fallback, and alias-driven downstream search behavior. | No replacement required. | Surrounding brand/search-profile proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/search/tests/queryBuilderCharacterization.test.js` | KEEP | Protects the public search-profile payload shape, provenance fields, seed-row behavior, guard terms, and hint-count accounting returned by the query builder. | No replacement required. | Surrounding brand/search-profile proof green on 2026-03-24. | Kept unchanged. |
| `src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js` | KEEP | Protects runtime-bridge artifact behavior, including the replacement contract that `search_profile_generated` writes a planned `search_profile.json` payload with normalized query rows. | No replacement required. | Targeted bridge/prefetch proof green on 2026-03-24. | Kept with new artifact contract coverage added. |
| `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | KEEP | Protects the runtime-ops brand-resolution surface derived from `brand_resolved` events and artifacts. | No replacement required. | Surrounding bridge/prefetch proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | KEEP | Protects compatibility defaults across prefetch sections when some event/artifact inputs are absent. | No replacement required. | Surrounding bridge/prefetch proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live-run validation that the prefetch tabs still hydrate populated brand/search-profile surfaces after the wrapper collapse. | No replacement required. | Live validation green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/brandResolver/tests/brandResolverStageCharacterization.test.js src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js src/features/indexing/search/tests/queryBuilderCharacterization.test.js`
- Result: green, 17/17 passing on 2026-03-24.
- `node --test src/indexlab/tests/runtimeBridgeEventAudit.workers.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js`
- Result: green, 15/15 passing on 2026-03-24.
- `node --test src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 1/1 passing on 2026-03-24.
- `npm test`
- Result: green, 5806/5806 passing on 2026-03-24.

## Extension: Orchestration Schema Return Audit

### Scope

- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`
- `src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.progressionContracts.test.js`
- `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js`
- `src/indexlab/tests/phase01NeedSetEngine.contracts.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | COLLAPSE | The file asserted captured planner/journey arguments, downstream config forwarding, brand-host mutation, and object identity of the merged result. Those checks pinned orchestration internals instead of the returned discovery contract. | Rewritten in place to keep only returned-result assertions over `seed_search_plan_output` and `enqueue_summary` for the handoff, failure, and planner-disabled branches. Emitted search-plan event behavior remains covered by `searchPlanEmissionProof.test.js`, while `runNeedSet`/phase-01 suites keep the search-plan seed contract. | Targeted orchestration schema proof green on 2026-03-25. | Kept with plumbing and identity assertions removed. |
| `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js` | KEEP | Protects the observable `needset_computed` and `search_plan_failed` event payloads emitted by the orchestrator. | No replacement required. | Surrounding orchestration schema proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.progressionContracts.test.js` | KEEP | Protects the pipeline checkpoint schema contracts that the orchestrator validates as it progresses. | No replacement required. | Surrounding orchestration schema proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js` | KEEP | Protects the `seedSearchPlan` contract returned by the NeedSet wrapper before orchestration attaches it to the final discovery result. | No replacement required. | Surrounding orchestration schema proof green on 2026-03-25. | Kept unchanged. |
| `src/indexlab/tests/phase01NeedSetEngine.contracts.test.js` | KEEP | Protects the phase-01 output and runtime-bridge event contract that underpins search-plan attachment. | No replacement required. | Surrounding orchestration schema proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live-run validation that populated search-plan needset/search-profile surfaces still hydrate the prefetch view after the orchestration collapse. | No replacement required. | Live validation green on 2026-03-25. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.progressionContracts.test.js`
- Result: green, 11/11 passing on 2026-03-25.
- `node --test src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js src/indexlab/tests/phase01NeedSetEngine.contracts.test.js`
- Result: green, 16/16 passing on 2026-03-25.
- `node --test src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 1/1 passing on 2026-03-25.

## Extension: Result Processing Selector Contract Audit

### Scope

- `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorIntegration.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorFallback.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.filtering.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.instrumentation.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.result-contract.test.js`
- `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.serp-shape.test.js`
- `src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js`
- `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js`
- `src/features/indexing/api/tests/runtimeOpsSearchWorkerTriageEnrichment.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorIntegration.test.js` | COLLAPSE | The file asserted selector invocation and generated id format, and duplicated top-level return-shape coverage already owned elsewhere. Those checks pinned internal LLM plumbing instead of the returned result contract. | Rewritten in place to keep only return-level contracts for all-reject, invalid-output fallback, and successful LLM selection. Shared builders moved into `src/features/indexing/pipeline/resultProcessing/tests/helpers/triageCharacterizationHarness.js`. | Targeted result-processing proof green on 2026-03-25. | Kept with internal call-shape and duplicate shape assertions removed. |
| `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorFallback.test.js` | COLLAPSE | The file duplicated invalid-output fallback, return-shape parity, logger-event checks, and success-path score-source checks already covered by neighboring contract suites. | Rewritten in place to keep fallback result contracts for selected URLs, cap enforcement, passthrough metadata, pinned-host ordering, zero-candidate behavior, and `fallback_applied`. Shared builders moved into `src/features/indexing/pipeline/resultProcessing/tests/helpers/triageCharacterizationHarness.js`. | Targeted result-processing proof green on 2026-03-25. | Kept with duplicate and logger-side-effect assertions removed. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.filtering.test.js` | COLLAPSE | One test asserted `domains_classified` logger payload shape from inside `processDiscoveryResults`, which was implementation-coupled and redundant with runtime boundary coverage. | Rewritten in place to keep only returned dedupe and hard-drop contracts. `domains_classified` boundary behavior remains covered by `src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js` and `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`. | Targeted result-processing and boundary proof green on 2026-03-25. | Kept with logger payload assertion removed. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.instrumentation.test.js` | COLLAPSE | The file asserted logger event-name emission from inside `processDiscoveryResults`, which protected an internal breadcrumb instead of returned behavior. | Rewritten in place to keep only the returned `serp_explorer` reason-code enrichment contract. | Targeted result-processing proof green on 2026-03-25. | Kept with event-name policing removed. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.result-contract.test.js` | KEEP | Protects the returned top-level discovery payload surface and selected URL contract. | No replacement required. | Targeted result-processing proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/pipeline/resultProcessing/tests/triageCharacterization.serp-shape.test.js` | KEEP | Protects the returned SERP explorer and search-profile aggregates consumed downstream. | No replacement required. | Targeted result-processing proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js` | KEEP | Protects the runtime-ops boundary projection for `domains_classified` events after the internal logger assertion was removed. | No replacement required. | Surrounding boundary proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js` | KEEP | Protects the runtime-ops boundary projection for `serp_selector_completed` candidate triage data. | No replacement required. | Surrounding boundary proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/tests/runtimeOpsSearchWorkerTriageEnrichment.test.js` | KEEP | Protects the search-worker consumer contract for triage decisions and score propagation. | No replacement required. | Surrounding boundary proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live validation that populated result-processing event/artifact surfaces still hydrate the runtime-ops prefetch UI after the collapse. | No replacement required. | Live validation green on 2026-03-25. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/resultProcessing/tests/*.test.js`
- Result: green, 75/75 passing on 2026-03-25.
- `node --test src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js src/features/indexing/api/tests/runtimeOpsSearchWorkerTriageEnrichment.test.js`
- Result: green, 10/10 passing on 2026-03-25.
- `node --test src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 1/1 passing on 2026-03-25.

## Extension: Full-Suite Blocker Cleanup

### Scope

- `tools/specfactory-process-manager.test.js`
- `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`
- `tools/gui-react/src/features/runtime-ops/panels/fetch/fetchStageRegistry.ts`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/specfactory-process-manager.test.js` | COLLAPSE | The restart-plan test asserted an exact `args` array and failed when the optional `--no-browser` flag was added. That pinned an internal launcher detail instead of the stable restart contract. | Rewritten in place to keep the stable restart-plan prefix contract (`dev-stack-control.js start-api`), preserve the `--no-browser` safety flag, and assert the returned working directory. | Targeted blocker proof green on 2026-03-25. | Kept with exact optional-flag array assertion removed. |
| `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js` | KEEP | Protects the public fetch-stage registry surface and selector fallback contracts. The failure was caused by a missing registry re-export, not by low-value assertions. | No test replacement required. Restored the registry export surface in `tools/gui-react/src/features/runtime-ops/panels/fetch/fetchStageRegistry.ts`. | Targeted blocker proof green on 2026-03-25. | Kept unchanged. |

### Proof Stack

- `node --test tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`
- Result: green, 4/4 passing on 2026-03-25.
- `node --test tools/specfactory-process-manager.test.js`
- Result: green, 8/8 passing on 2026-03-25.
- `npm test`
- Result: green, 5816/5816 passing on 2026-03-25.

## Extension: Bootstrap Phase Return Audit

### Scope

- `src/features/indexing/pipeline/orchestration/tests/bootstrapPhaseCharacterization.test.js`
- `src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.bootstrapContracts.test.js`
- `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- `src/features/indexing/search/tests/phase02SearchProfile.brand-host-hints.test.js`
- `src/features/indexing/search/tests/queryBuilderFieldAllocation.test.js`
- `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/orchestration/tests/bootstrapPhaseCharacterization.test.js` | COLLAPSE | The file captured downstream `categoryConfig` and `variables` arguments from `runDiscoverySeedPlan`, and asserted planner side effects via `updateBrandHints`. Those checks pinned orchestration wiring rather than the bootstrap phase output contract. | Rewritten in place to call `bootstrapPhase.execute()` directly and assert only the returned bootstrap payload: promoted host data, resolved identity, merged missing-field output, loaded learning artifacts, merged lexicon hints, and `pipelineContextAfterBootstrap` schema validity. | Targeted bootstrap proof green on 2026-03-25. | Kept with captured-args and planner-side-effect assertions removed. |
| `src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.bootstrapContracts.test.js` | KEEP | Protects the public schema contract for the accumulated after-bootstrap pipeline context. | No replacement required. | Targeted bootstrap proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js` | KEEP | Protects the returned orchestration contract for schema handoff and enqueue-summary behavior after bootstrap completes. | No replacement required. | Targeted bootstrap proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/search/tests/phase02SearchProfile.brand-host-hints.test.js` | KEEP | Protects downstream brand-host query behavior that consumes the bootstrap phase host promotion and resolver output. | No replacement required. | Surrounding downstream proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/search/tests/queryBuilderFieldAllocation.test.js` | KEEP | Protects downstream query builder allocation and official-domain fallback behavior that matters after bootstrap host promotion. | No replacement required. | Surrounding downstream proof green on 2026-03-25. | Kept unchanged. |
| `src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js` | KEEP | Provides live validation that the indexing runtime still hydrates the populated prefetch surfaces after the bootstrap collapse. | No replacement required. | Live validation green on 2026-03-25. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/orchestration/tests/bootstrapPhaseCharacterization.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.bootstrapContracts.test.js src/features/indexing/pipeline/orchestration/tests/runDiscoverySeedPlanSchema.test.js`
- Result: green, 11/11 passing on 2026-03-25.
- `node --test src/features/indexing/search/tests/phase02SearchProfile.brand-host-hints.test.js src/features/indexing/search/tests/queryBuilderFieldAllocation.test.js src/features/indexing/api/builders/tests/searchPlanPrefetchLiveWiring.live-run.test.js`
- Result: green, 13/13 passing on 2026-03-25.
- `npm test`
- Result: green, 5816/5816 passing on 2026-03-25.
