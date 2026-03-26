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

## Extension: App API Catalog Helpers Reliability Audit

### Scope

- `src/app/api/tests/apiCatalogHelpersWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiCatalogHelpersWiring.test.js` | KEEP | Protects real app-api catalog helper behavior: seeded catalog enrichment, orphan skipping, queue-state fallback, compiled component-db patch writes, and no-op behavior when no matching entity exists. | Kept in place with stronger exact-row assertions and negative-path coverage for queue-state failure and missing component matches. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/apiCatalogHelpersWiring.test.js`
- Result: green, 4/4 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 87/87 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5904/5906 passing overall).

## Extension: App API Category Alias Reliability Audit

### Scope

- `src/app/api/tests/apiCategoryAliasWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiCategoryAliasWiring.test.js` | KEEP | Protects the public category-token normalization and test-category alias resolution behavior that app-api callers rely on, including canonical `_test_` aliasing and unresolved alias fallback. | Kept in place with table-driven normalization assertions and expanded alias-resolution coverage for canonical aliases, existing plain aliases, normalized mixed-case input, and the missing-alias negative path. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/apiCategoryAliasWiring.test.js`
- Result: green, 2/2 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 87/87 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5904/5906 passing overall).

## Extension: App API Process Runtime Reliability Audit

### Scope

- `src/app/api/tests/apiProcessRuntimeWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiProcessRuntimeWiring.test.js` | KEEP | Protects real runtime process behavior: child spawn contract, active-run status shape, stop confirmation, screencast forwarding, storage-root propagation, and failure-path completion behavior on non-zero exits. | Kept in place with stricter spawn/status assertions and added non-zero-exit coverage that verifies compile completion stays skipped while index completion and failure reporting still occur. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/apiProcessRuntimeWiring.test.js`
- Result: green, 6/6 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 88/88 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5905/5907 passing overall).

## Extension: App API Realtime Bridge Reliability Audit

### Scope

- `src/app/api/tests/apiRealtimeBridgeWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiRealtimeBridgeWiring.test.js` | KEEP | Protects runtime-critical websocket behavior: filtered event fanout, process-status delivery, screencast control forwarding, watcher-based runtime/indexlab deltas, append-only indexlab streaming, and last-frame screencast caching. | Kept in place with stronger negative coverage for empty filtered deliveries and append-only watcher behavior so stream consumers do not receive suppressed or duplicate rows. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/apiRealtimeBridgeWiring.test.js`
- Result: green, 6/6 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 90/90 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5907/5909 passing overall).

## Extension: App API SpecDb Runtime Reliability Audit

### Scope

- `src/app/api/tests/apiSpecDbRuntimeWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiSpecDbRuntimeWiring.test.js` | KEEP | Protects the runtime contract for seeded handle reuse, alias-aware auto-seed readiness, and best-available DB reuse even when background seeding fails. | Kept in place with added failure-path coverage to ensure `getSpecDbReady(...)` still resolves the cached handle and logs the seed failure instead of dropping the DB reference. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/apiSpecDbRuntimeWiring.test.js`
- Result: green, 3/3 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 91/91 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5908/5910 passing overall).

## Extension: App API Command Capture Reliability Audit

### Scope

- `src/app/api/tests/commandCapture.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/commandCapture.test.js` | KEEP | Protects the command-capture contract for success, non-zero exit, spawn failure, process error, timeout, null exit code, and DI pass-through of `cwd` and `env` into the spawned child. | Kept in place with stronger timeout assertions and an added DI wiring test so the documented spawn-option contract is actually proven. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` and `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/commandCapture.test.js`
- Result: green, 7/7 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 92/92 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` and `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts` (5908/5911 passing overall).

## Extension: App API Route Registry Reliability Audit

### Scope

- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | KEEP | Protects request-dispatch and route-registry behavior that the GUI server depends on: category alias parsing, first-match routing, null when no handler matches, HTTP wrapper 404/error/static behavior, `/health` API handling, ordered route assembly, and registry validation failures. | Kept in place with added no-match and `/health` handled-response coverage so the dispatch layer is proven by behavior rather than implied by implementation. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js`. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- Result: green, 7/7 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 94/94 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures in `src/features/crawl/plugins/tests/pluginRegistry.test.js` (5909/5911 passing overall).

## Extension: App API Static File Reliability Audit

### Scope

- `src/app/api/tests/guiStaticFileServerWiring.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/guiStaticFileServerWiring.test.js` | KEEP | Protects the public static-serving contract: asset streaming, SPA-shell fallback for extensionless routes and missing assets, query-string stripping, terminal 404s, and MIME resolution. | Kept in place with added query-string asset coverage so cache-busted asset URLs remain proven without expanding into filesystem trivia. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof blocked by unrelated failures including `src/features/crawl/plugins/tests/pluginRegistry.test.js` and a `better-sqlite3` ABI mismatch against Node 24 that breaks many external suites. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/guiStaticFileServerWiring.test.js`
- Result: green, 6/6 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 95/95 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated failures including `src/features/crawl/plugins/tests/pluginRegistry.test.js` and a `better-sqlite3` ABI mismatch against Node 24 that breaks many external suites.

## Extension: App API Process Lifecycle State Reliability Audit

### Scope

- `src/app/api/tests/processLifecycleState.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/processLifecycleState.test.js` | KEEP | Protects the public process-state contract for lifecycle transitions, status derivation, legacy/canonical key alignment, run-id normalization, storage-destination resolution, and relocation-state reporting. | Kept in place with an added relocation edge case proving that the public run id remains the last valid run token even when the internal relocation marker falls back to `'unknown'`. | Targeted file and surrounding `src/app/api/tests` proof green on 2026-03-25; full-suite proof remains blocked by unrelated failures including `src/features/crawl/plugins/tests/pluginRegistry.test.js` and the external `better-sqlite3` ABI mismatch against Node 24. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/processLifecycleState.test.js`
- Result: green, 30/30 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 96/96 passing on 2026-03-25.
- `npm test`
- Result: remains blocked on 2026-03-25 by unrelated failures including `src/features/crawl/plugins/tests/pluginRegistry.test.js` and the external `better-sqlite3` ABI mismatch against Node 24.

## Extension: App API Process Orphan Ops Reliability Audit

### Scope

- `src/app/api/tests/processOrphanOps.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/processOrphanOps.test.js` | KEEP | Protects the real orphan-cleanup contract for PID parsing, Windows taskkill execution, invalid-pid rejection, and platform-specific process-discovery commands used to find stranded IndexLab workers. | Kept in place with stronger command-contract assertions for the Windows `taskkill` call plus the win32 and POSIX process-discovery shells and timeouts. | Targeted file, surrounding `src/app/api/tests`, and full-suite proof green on 2026-03-25. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/processOrphanOps.test.js`
- Result: green, 14/14 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 98/98 passing on 2026-03-25.
- `npm test`
- Result: green, 5917/5917 passing on 2026-03-25.

## Extension: App API SearXNG Runtime Reliability Audit

### Scope

- `src/app/api/tests/searxngRuntime.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/searxngRuntime.test.js` | KEEP | Protects runtime-critical SearXNG behavior: docker availability detection, compose-file gating, container status inspection, normalized base-url probing, docker-ps failure reporting, compose-up launch, and bounded retry behavior when the stack stays unready. | Kept in place with stronger assertions for docker command shape, normalized `/search` probe URL and timeout cleanup, surfaced `docker_error`, immediate-start no-sleep behavior, and the documented 10x800ms retry ceiling. | Targeted file, surrounding `src/app/api/tests`, and full-suite proof green on 2026-03-25. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/tests/searxngRuntime.test.js`
- Result: green, 13/13 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 98/98 passing on 2026-03-25.
- `npm test`
- Result: green, 5917/5917 passing on 2026-03-25.

## Extension: App API Route Contracts Reliability Audit

### Scope

- `src/app/api/routes/tests/processStartRunIdContract.test.js`
- `src/app/api/routes/tests/infraRoutesContract.test.js`
- `src/app/api/routes/tests/testModeRoutesContract.test.js`
- `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js`
- `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/routes/tests/processStartRunIdContract.test.js` | KEEP | Protects the public `/api/infra/process/start` and `/api/infra/process/status` contract for run-id propagation, helper-root overrides, storage-root resolution, snapshot-only runtime settings, and launch validation failures. | Kept in place with stronger `missing_generated_field_rules` error-body assertions for `helper_root` and `field_rules_paths`. | Targeted route-slice and surrounding app-api proof green on 2026-03-25; full-suite proof blocked by an external `better-sqlite3` ABI mismatch plus a locked `better_sqlite3.node` held by a local `src/api/guiServer.js --port 8788 --local` process. | Kept with stronger assertions. |
| `src/app/api/routes/tests/infraRoutesContract.test.js` | KEEP | Protects the top-level infra route registration contract for health, categories, SearXNG start failures, and GraphQL proxy pass-through. | No replacement required. | Targeted route-slice and surrounding app-api proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch and locked module file. | Kept unchanged. |
| `src/app/api/routes/tests/testModeRoutesContract.test.js` | KEEP | Protects test-mode API validation behavior for missing source categories, empty status shape, invalid non-test categories, and test-category deletion safety. | Kept in place with a new path-traversal deletion guard test. That test exposed a real partial-delete bug, so `src/app/api/routes/testModeRoutes.js` was fixed to prevalidate every resolved delete target before removing anything. | Targeted route-slice and surrounding app-api proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch and locked module file. | Kept with stronger assertions and route bug fixed. |
| `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js` | KEEP | Protects category listing and creation behavior, including public filtering, fallback behavior, scaffold failures, and category creation side effects. | Kept in place with stronger assertions for created directories and the `category-created` data-change emission. | Targeted route-slice and surrounding app-api proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch and locked module file. | Kept with stronger assertions. |
| `src/app/api/routes/infra/tests/infraProcessRoutes.test.js` | KEEP | Protects the process-route dispatcher contract, including pass-through status behavior, replace-running timeout handling, and restart behavior after stop attempts. | Kept in place with added regression coverage that proves the route does not redundantly call `waitForProcessExit(...)` after `stopProcess(...)` and still restarts when the prior process has already exited, plus thrown-start error coverage. | Targeted route-slice and surrounding app-api proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch and locked module file. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/api/routes/tests/processStartRunIdContract.test.js src/app/api/routes/tests/infraRoutesContract.test.js src/app/api/routes/tests/testModeRoutesContract.test.js src/app/api/routes/infra/tests/infraCategoryRoutes.test.js src/app/api/routes/infra/tests/infraProcessRoutes.test.js`
- Result: green, 39/39 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/api/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/api/routes/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/api/routes/infra/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 137/137 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 because Node `v24.13.1` requires `NODE_MODULE_VERSION 137`, but `node_modules/better-sqlite3/build/Release/better_sqlite3.node` is built for `127`. `npm rebuild better-sqlite3` was attempted and also failed because the module file is locked by a local `src/api/guiServer.js --port 8788 --local` process (`PID 8064`).

## Extension: App CLI Surface Reliability Audit

### Scope

- `src/app/cli/tests/commandDispatch.test.js`
- `src/app/cli/tests/queueCli.test.js`
- `src/app/cli/tests/publishCli.test.js`
- `src/app/cli/tests/reviewCli.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/cli/tests/commandDispatch.test.js` | KEEP | Protects the top-level CLI dispatcher contract for handler selection, exact invocation payload handoff, and unknown-command failure behavior. | Kept in place with stronger assertions that the dispatcher passes the original config/storage/args references through unchanged and preserves handler-thrown errors instead of swallowing them. | Targeted CLI file and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/tests/queueCli.test.js` | KEEP | Protects the real queue command surface through the CLI entrypoint: queue lifecycle operations, batch CSV import, and user-visible errors for invalid pause requests. | Kept in place with a missing-product negative case so the top-level CLI surface proves the exact pause failure message rather than only happy-path queue state transitions. | Targeted CLI file and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/tests/publishCli.test.js` | KEEP | Protects the publish/provenance/changelog command surface at the real CLI entrypoint, including approved-override publishing and provenance/changelog lookups. | Kept in place with a top-level provenance validation failure case so missing required args are proven through the actual CLI wrapper, not only at lower command layers. | Targeted CLI file and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/tests/reviewCli.test.js` | KEEP | Protects the review suggestion CLI surface, including persisted suggestion payload shape under the real helper-root wiring. | Kept in place with more specific persisted-JSON assertions for `product_id` and evidence URL/quote so the file proves the saved suggestion shape rather than only append success. | Targeted CLI file and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/cli/tests/commandDispatch.test.js src/app/cli/tests/queueCli.test.js src/app/cli/tests/publishCli.test.js src/app/cli/tests/reviewCli.test.js`
- Result: green, 9/9 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/cli/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/cli/commands/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 52/52 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to the same external `better-sqlite3` ABI mismatch (`NODE_MODULE_VERSION 127` vs required `137`), with `npm rebuild better-sqlite3` still blocked by the locked module file held by local `src/api/guiServer.js --port 8788 --local` (`PID 8064`), plus unrelated GUI contract failures in `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.apiKeyFilterContracts.test.ts` and `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.mergeContracts.test.ts`.

## Extension: App CLI Command Contracts Reliability Audit I

### Scope

- `src/app/cli/commands/tests/benchmarkCommand.test.js`
- `src/app/cli/commands/tests/billingReportCommand.test.js`
- `src/app/cli/commands/tests/discoverCommand.test.js`
- `src/app/cli/commands/tests/explainUnkCommand.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/cli/commands/tests/benchmarkCommand.test.js` | KEEP | Protects the benchmark command contract for normalized command naming, benchmark summary passthrough, default category handling, and max-case normalization. | Kept in place with stronger dependency-call assertions so the command proves the exact `storage`, `category`, `fixturePath`, and `maxCases` payload passed to `runGoldenBenchmark(...)`. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/billingReportCommand.test.js` | KEEP | Protects the billing-report command contract for explicit month passthrough and default month generation. | Kept in place with deterministic time control and exact dependency-call assertions so the default-month test no longer depends on wall-clock timing or a loose regex. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions and flake removed. |
| `src/app/cli/commands/tests/discoverCommand.test.js` | KEEP | Protects the discover command contract for brand filtering, missing-critical-field round context, per-run summaries, and event logger lifecycle. | Kept in place with a failure-path test proving the logger flushes even when discovery throws. That test exposed a real bug, so `src/app/cli/commands/discoverCommand.js` now flushes the logger in `finally` before rethrowing discovery failures. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions and command bug fixed. |
| `src/app/cli/commands/tests/explainUnkCommand.test.js` | KEEP | Protects the explain-unk command contract for derived product ids, latest-artifact lookup failures, unknown-field extraction, and compatibility with legacy summary payloads. | Kept in place with an added legacy `run_id` and missing-normalized-output fallback case so the command’s empty-result contract is proven instead of inferred. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/cli/commands/tests/benchmarkCommand.test.js src/app/cli/commands/tests/billingReportCommand.test.js src/app/cli/commands/tests/discoverCommand.test.js src/app/cli/commands/tests/explainUnkCommand.test.js`
- Result: green, 11/11 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/cli/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/cli/commands/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 54/54 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to the same external `better-sqlite3` ABI mismatch (`NODE_MODULE_VERSION 127` vs required `137`) and locked module file held by local `src/api/guiServer.js --port 8788 --local` (`PID 8064`), plus unrelated GUI contract failures including `tools/gui-react/src/features/llm-config/state/__tests__/llmProviderRegistryBridge.test.ts`.

## Extension: App CLI Command Contracts Reliability Audit III

### Scope

- `src/app/cli/commands/tests/queueCommand.test.js`
- `src/app/cli/commands/tests/rebuildIndexCommand.test.js`
- `src/app/cli/commands/tests/reviewCommand.test.js`
- `src/app/cli/commands/tests/sourcesPlanCommand.test.js`
- `src/app/cli/commands/tests/sourcesReportCommand.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/cli/commands/tests/queueCommand.test.js` | KEEP | Protects the queue command contract for subcommand validation, list payload shaping, add-path queue upserts, required clear status, and derived queue statistics. | Kept in place with a new `stats` contract test that proves exact status and priority aggregation from persisted queue state rather than only checking that rows exist. | Targeted command files, surrounding `src/app/cli`, and full `src/app` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/rebuildIndexCommand.test.js` | KEEP | Protects the rebuild-index command contract for category normalization, dependency-call shape, and summary payload output. | Kept in place with stronger exact-call assertions and a whitespace-padded category regression case. That test exposed a real bug, so `src/app/cli/commands/rebuildIndexCommand.js` now trims CLI category input before rebuilding the index. | Targeted command files, surrounding `src/app/cli`, and full `src/app` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions and command bug fixed. |
| `src/app/cli/commands/tests/reviewCommand.test.js` | KEEP | Protects the review command surface for subcommand validation, queue/product/build/manual-override contracts, websocket metadata, and suggestion payload normalization. | Kept in place with a failure-path test proving the opened SpecDb handle is closed exactly once when `buildReviewQueue(...)` throws, so cleanup is contractually protected rather than assumed. | Targeted command files, surrounding `src/app/cli`, and full `src/app` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/sourcesPlanCommand.test.js` | KEEP | Protects the sources-plan command contract for category resolution, category-config loading, and expansion-plan payload output. | Kept in place with exact dependency-call assertions and a whitespace-padded category regression case. That test exposed a real bug, so `src/app/cli/commands/sourcesPlanCommand.js` now trims CLI category input before planning. | Targeted command files, surrounding `src/app/cli`, and full `src/app` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions and command bug fixed. |
| `src/app/cli/commands/tests/sourcesReportCommand.test.js` | KEEP | Protects the sources-report command contract for normalized category lookup, planner-score ordering, top limits, and promotion-suggestion reporting. | Kept in place with exact promotion-key assertions and a whitespace-padded category regression case. That test exposed a real bug, so `src/app/cli/commands/sourcesReportCommand.js` now trims CLI category input before loading source intel. | Targeted command files, surrounding `src/app/cli`, and full `src/app` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions and command bug fixed. |

During surrounding CLI proof, the top-level entrypoint also exposed a real regression in `src/cli/spec.js`: the lazy-loader refactor had removed `dispatchCliCommand(...)` but `executeCli(...)` still referenced it. The entrypoint now carries a visible `BUG:` note next to the repaired `executeCommand(...)` call so the CLI surface remains executable under the new loader design.

### Proof Stack

- `node --test src/app/cli/commands/tests/queueCommand.test.js src/app/cli/commands/tests/rebuildIndexCommand.test.js src/app/cli/commands/tests/reviewCommand.test.js src/app/cli/commands/tests/sourcesPlanCommand.test.js src/app/cli/commands/tests/sourcesReportCommand.test.js`
- Result: green, 26/26 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/cli/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/cli/commands/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 57/57 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app -Recurse -Filter '*.test.js' | ForEach-Object FullName)`
- Result: green, 194/194 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to unrelated repo-wide issues outside `src/app`, including the `better-sqlite3` ABI mismatch under Node `v24.13.1` across DB-backed suites and assertion failures in `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`.

## Extension: App CLI Command Contracts Reliability Audit II

### Scope

- `src/app/cli/commands/tests/intelGraphApiCommand.test.js`
- `src/app/cli/commands/tests/learningReportCommand.test.js`
- `src/app/cli/commands/tests/llmHealthCommand.test.js`
- `src/app/cli/commands/tests/migrateToSqliteCommand.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/cli/commands/tests/intelGraphApiCommand.test.js` | KEEP | Protects the intel-graph-api command contract for defaulted host/port/category behavior and normalized endpoint output. | Kept in place with stronger dependency-call assertions so the command proves the exact `storage`, `config`, `category`, `host`, and `port` payload given to `startIntelGraphApi(...)`. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/learningReportCommand.test.js` | KEEP | Protects the learning-report command contract for category defaulting and request normalization. | Kept in place with stronger trimming and dependency-call assertions so explicit categories are proven normalized before `buildLearningReport(...)` runs. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/llmHealthCommand.test.js` | KEEP | Protects the llm-health command contract for provider normalization, model trimming, and result passthrough. | Kept in place with stronger dependency-call assertions so the command proves exact `storage`, `config`, `provider`, and `model` values passed to `runLlmHealthCheck(...)`. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |
| `src/app/cli/commands/tests/migrateToSqliteCommand.test.js` | KEEP | Protects a real migration surface: required category validation, SpecDb open failures, queue verification, billing ledger import, and cache import semantics. | Kept in place with new phase-3 coverage proving only fresh LLM cache entries are imported while expired, malformed, and response-less cache files are skipped. | Targeted command files and surrounding `src/app/cli` proof green on 2026-03-25; full-suite proof blocked by the external `better-sqlite3` ABI mismatch plus unrelated GUI contract failures. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/app/cli/commands/tests/intelGraphApiCommand.test.js src/app/cli/commands/tests/learningReportCommand.test.js src/app/cli/commands/tests/llmHealthCommand.test.js src/app/cli/commands/tests/migrateToSqliteCommand.test.js`
- Result: green, 11/11 passing on 2026-03-25.
- `node --test (Get-ChildItem src/app/cli/tests/*.test.js | ForEach-Object FullName) (Get-ChildItem src/app/cli/commands/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 55/55 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 due to the same external `better-sqlite3` ABI mismatch (`NODE_MODULE_VERSION 127` vs required `137`) and locked module file held by local `src/api/guiServer.js --port 8788 --local` (`PID 8064`), plus unrelated GUI contract failures including `tools/gui-react/src/features/llm-config/state/__tests__/llmProviderRegistryBridge.test.ts`.

## Extension: Category Loader Reliability Audit

### Scope

- `src/categories/tests/categoryGeneratedLoader.test.js`
- `src/categories/tests/categoryLoaderOverride.test.js`
- `src/categories/tests/sourceRegistryLoader.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/categories/tests/categoryGeneratedLoader.test.js` | KEEP | Protects the category loader contract for generated field-rule hydration, authority-over-legacy precedence, required-field derivation, UI-field ordering, and generated path metadata. | Kept in place with exact schema and required-field assertions, helper-path assertions, and a new `field_rules.runtime.json` fallback case so the loader’s runtime-generated contract is proven without relying on incidental file presence. | Targeted category files and surrounding `src/categories/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |
| `src/categories/tests/categoryLoaderOverride.test.js` | KEEP | Protects the source-override merge contract for S3 override keys, merged approved hosts, denylist preservation, and absent-override behavior. | Replaced the repo-state-dependent test body with isolated temp-root fixtures so the contract is proven against explicit category inputs instead of whatever happens to exist in the workspace. Added a negative case for missing override files. | Targeted category files and surrounding `src/categories/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions and flake risk removed. |
| `src/categories/tests/sourceRegistryLoader.test.js` | KEEP | Protects source-registry host resolution for rich metadata mapping, host list materialization, removed manufacturer-override behavior, URL-template fallback, and tier precedence. | Kept in place with exact host-row assertions plus a new case proving host extraction from `url_templates` and preservation of a stronger approved tier when the registry declares a weaker one. | Targeted category files and surrounding `src/categories/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/categories/tests/categoryGeneratedLoader.test.js src/categories/tests/categoryLoaderOverride.test.js src/categories/tests/sourceRegistryLoader.test.js`
- Result: green, 8/8 passing on 2026-03-25.
- `node --test (Get-ChildItem src/categories/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 8/8 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 outside this slice. Latest repo-wide run reported 5868 tests with 5706 passing and 149 failing, dominated by the `better-sqlite3` ABI mismatch under Node `v24.13.1` plus unrelated GUI assertion failures in `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`.

## Extension: Concurrency Reliability Audit

### Scope

- `src/concurrency/tests/laneManager.test.js`
- `src/concurrency/tests/requestThrottler.test.js`
- `src/concurrency/tests/workerPool.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/concurrency/tests/laneManager.test.js` | KEEP | Protects lane scheduling behavior for default/custom concurrency, pause/resume, drain, budget gating, and per-lane stats. | Kept in place with a new failure-path case proving that a rejected task increments `failed`, releases the queued slot, and leaves the lane snapshot in the expected terminal state. | Targeted concurrency files and surrounding `src/concurrency/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |
| `src/concurrency/tests/requestThrottler.test.js` | KEEP | Protects throttling contracts for global/key token buckets, cooldown penalties, host-serialized execution, and parallelism across distinct hosts. | Kept in place with exact waited-millisecond assertions, normalized-key/global-penalty coverage, and a host-gate rejection case proving slots are released after thrown task failures. | Targeted concurrency files and surrounding `src/concurrency/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |
| `src/concurrency/tests/workerPool.test.js` | KEEP | Protects worker-pool scheduling, queueing, drain semantics, return values, and mixed success/failure stats under concurrency limits. | Kept in place with new cases proving a rejected active task releases queued work and that `drain()` still resolves after failures finish unwinding. | Targeted concurrency files and surrounding `src/concurrency/tests` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/concurrency/tests/laneManager.test.js src/concurrency/tests/requestThrottler.test.js src/concurrency/tests/workerPool.test.js`
- Result: green, 29/29 passing on 2026-03-25.
- `node --test (Get-ChildItem src/concurrency/tests/*.test.js | ForEach-Object FullName)`
- Result: green, 68/68 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 outside this slice. Latest repo-wide run reported 5873 tests with 5711 passing and 149 failing, dominated by repeated `better-sqlite3` ABI mismatches under Node `v24.13.1` plus unrelated GUI assertion failures in `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`.

## Extension: Extraction Reliability Audit

### Scope

- `src/features/extraction/core/tests/extractionRunner.test.js`
- `src/features/extraction/plugins/screenshot/tests/screenshotPlugin.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/extraction/core/tests/extractionRunner.test.js` | KEEP | Protects the extraction runner contract for sequential plugin execution, result aggregation, crash isolation, read-only context handling, and extraction event telemetry. | Kept in place with stronger nested-context immutability assertions and exact failed-event payload assertions. Those tests exposed a real bug, so `src/features/extraction/core/extractionRunner.js` now deep-freezes nested plain context data and includes `plugin` and `url` in `extraction_plugin_failed` telemetry. | Targeted extraction files and surrounding `src/features/extraction` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions and runner bug fixed. |
| `src/features/extraction/plugins/screenshot/tests/screenshotPlugin.test.js` | KEEP | Protects the screenshot extraction plugin contract for disabled no-op behavior and enabled screenshot capture delegation. | Kept in place with a real enabled-path contract test that proves the plugin returns both selector crops and a full-page screenshot through the crawl screenshot API instead of only checking disabled paths. | Targeted extraction files and surrounding `src/features/extraction` proof green on 2026-03-25; repo-wide proof still fails outside this slice. | Kept with stronger assertions. |

### Proof Stack

- `node --test src/features/extraction/core/tests/extractionRunner.test.js src/features/extraction/plugins/screenshot/tests/screenshotPlugin.test.js`
- Result: green, 13/13 passing on 2026-03-25.
- `node --test (Get-ChildItem src/features/extraction -Recurse -File | Where-Object { $_.Name -match '(test|spec)\.(js|ts|tsx|mjs|cjs)$' } | ForEach-Object FullName)`
- Result: green, 13/13 passing on 2026-03-25.
- `npm test`
- Result: failed on 2026-03-25 outside this slice. Latest repo-wide run reported 5881 tests with 5717 passing and 151 failing, still dominated by repeated `better-sqlite3` ABI mismatches under Node `v24.13.1` plus unrelated GUI assertion failures in `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`.

## Extension: App API Duplicate Plumbing Consolidation Audit

### Scope

- `src/app/api/tests/apiCatalogHelpersWiring.test.js`
- `src/app/api/tests/apiCategoryAliasWiring.test.js`
- `src/app/api/tests/apiProcessRuntimeWiring.test.js`
- `src/app/api/tests/apiRealtimeBridgeWiring.test.js`
- `src/app/api/tests/apiSpecDbRuntimeWiring.test.js`
- `src/app/api/tests/commandCapture.test.js`
- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- `src/app/api/tests/guiStaticFileServerWiring.test.js`
- `src/app/api/tests/processLifecycleState.test.js`
- `src/app/api/tests/processOrphanOps.test.js`
- `src/app/api/tests/searxngRuntime.test.js`
- `src/app/api/routes/tests/infraRoutesContract.test.js`
- `src/app/api/routes/tests/processStartRunIdContract.test.js`
- `src/app/api/routes/tests/testModeRoutesContract.test.js`
- `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js`
- `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/apiCatalogHelpersWiring.test.js` | KEEP | Protects real catalog enrichment and compiled component patch behavior, not source layout. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/apiCategoryAliasWiring.test.js` | KEEP | Protects public category-token normalization and canonical test-category alias behavior. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/apiProcessRuntimeWiring.test.js` | KEEP | Protects runtime process orchestration, child status shape, failure handling, and output-root propagation. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/apiRealtimeBridgeWiring.test.js` | KEEP | Protects websocket stream fanout, watcher-driven runtime updates, and screencast cache behavior. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/apiSpecDbRuntimeWiring.test.js` | KEEP | Protects alias-aware SpecDb readiness and seeded-handle reuse behavior. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/commandCapture.test.js` | KEEP | Protects the command-capture result contract and timeout/spawn-error behavior that process routes depend on. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | KEEP | Protects request parsing, first-match dispatch, static/API handoff, and route-registry validation behavior. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/guiStaticFileServerWiring.test.js` | KEEP | Protects the actual static-serving contract: asset streaming, SPA fallback, cache headers, and MIME handling. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/processLifecycleState.test.js` | KEEP | Protects the public process-status contract and storage-destination derivation. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/processOrphanOps.test.js` | KEEP | Protects real orphan-process discovery and Windows taskkill command behavior. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/tests/searxngRuntime.test.js` | KEEP | Protects runtime-critical SearXNG readiness, docker command shape, and bounded start retries. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/routes/tests/infraRoutesContract.test.js` | KEEP | Now carries the meaningful public category route contract: filtering, success creation, invalid name, conflict, scaffold failure, SearXNG failure, and GraphQL pass-through. | Expanded to absorb the public request/response cases retired from `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js`. | Replacement and App API sector proof green on 2026-03-25. | Kept with stronger boundary coverage. |
| `src/app/api/routes/tests/processStartRunIdContract.test.js` | KEEP | Now carries the meaningful public process route contract: run-id propagation, validation failure, generated-rules gating, replace-running timeout/restart, and thrown-start failure handling. | Expanded to absorb the public request/response and orchestration cases retired from `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`. | Replacement and App API sector proof green on 2026-03-25. | Kept with stronger boundary coverage. |
| `src/app/api/routes/tests/testModeRoutesContract.test.js` | KEEP | Protects the public test-mode route contract for invalid categories, empty status surface, and deletion safety. | No replacement required. | App API sector proof green on 2026-03-25. | Kept unchanged. |
| `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js` | COLLAPSE | It duplicated category list/create behavior at an internal handler layer, including non-production fallthrough and no-scaffold path checks that did not strengthen the public contract. | Replaced by `src/app/api/routes/tests/infraRoutesContract.test.js`. | Replacement and App API sector proof green on 2026-03-25. | Deleted after boundary coverage absorbed the real request contract. |
| `src/app/api/routes/infra/tests/infraProcessRoutes.test.js` | COLLAPSE | It duplicated process start/status behavior at an internal handler layer and spent assertions on handler fallthrough instead of the public route contract. | Replaced by `src/app/api/routes/tests/processStartRunIdContract.test.js`. | Replacement and App API sector proof green on 2026-03-25. | Deleted after boundary coverage absorbed the real request and orchestration contract. |

### Proof Stack

- `node --test --test-isolation=none src/app/api/routes/tests/infraRoutesContract.test.js src/app/api/routes/tests/processStartRunIdContract.test.js`
- Result: green, 18/18 passing on 2026-03-25.
- `node --test --test-isolation=none (Get-ChildItem src/app/api -Recurse -Filter '*.test.js' | ForEach-Object FullName)`
- Result: green, 95/95 passing on 2026-03-25.
- `npm test -- --test-isolation=none`
- Result: failed on 2026-03-25 outside this slice with 5889/5900 passing. The remaining failures were unrelated to `src/app/api`: `src/app/cli/tests/reviewCli.test.js`, `src/features/indexing/api/contracts/tests/runtimeOpsShapeContract.test.js`, `tools/gui-react/src/features/runtime-ops/panels/fetch/__tests__/fetchStageSelectProps.test.js`, and three `tools/nativeModulePreflight.test.js` cases blocked by sandbox `spawn EPERM`.
- Live validation attempt: blocked on 2026-03-25. Starting `node src/api/guiServer.js --port 8899 --local` failed before HTTP readiness because `better-sqlite3` is built for `NODE_MODULE_VERSION 127` while Node `v24.13.1` requires `137`, so no live `/api/v1/health` or `/api/v1/infra/process/start` proof could be collected in this environment.

### Coverage Summary

- Deleted tests: `src/app/api/routes/infra/tests/infraCategoryRoutes.test.js`, `src/app/api/routes/infra/tests/infraProcessRoutes.test.js`.
- Replacement tests: stronger public route coverage now lives in `src/app/api/routes/tests/infraRoutesContract.test.js` and `src/app/api/routes/tests/processStartRunIdContract.test.js`.
- Preserved behavior: category listing/creation failures, process start/status and replace-running branches, test-mode safety, process runtime behavior, realtime fanout, SpecDb readiness, static serving, orphan cleanup, and SearXNG runtime contracts.
- Remaining uncertainty: this sector is only partially proven at repo-wide/live-runtime level because unrelated repo failures remain and the real GUI API server cannot boot under the current `better-sqlite3` ABI mismatch.
