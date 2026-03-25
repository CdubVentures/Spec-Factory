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

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-level test-audit rules that shape the preserved historical log |
| source | `docs/05-operations/documentation-audit-ledger.md` | this file is retained as supplemental history, not current-state authority |

## Related Documents

- [Documentation Audit Ledger](../05-operations/documentation-audit-ledger.md) - explains why this historical audit file is preserved.
- [README](../README.md) - marks `docs/test-audit/` as supplemental rather than part of the active reading order.
