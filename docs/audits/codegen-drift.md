# Codegen Drift Audit

Date: 2026-04-27
Worst severity: **HIGH** — only 1 of 11 codegen scripts is auto-invoked at build time; CI has no `git diff --exit-code` guard, so a developer can edit a registry and ship without regenerating.

## Codegen inventory

| Script | Inputs | Outputs | Auto-run | Drift risk |
|---|---|---|---|---|
| `tools/gui-react/scripts/generateLlmPhaseRegistry.js` | `llmPhaseDefs.js`, `finderModuleRegistry.js`, `operationTypeRegistry.js` | 10 frontend files (phase IDs, overrides, operation registry, finder panels, module settings, billing call types, finder settings, phase schemas backend) | ✗ | **HIGH** |
| `tools/gui-react/scripts/generateFinderTypes.js` | `finderModuleRegistry.js` + per-finder schema | per-finder `types.generated.ts` | ✗ | MEDIUM |
| `tools/gui-react/scripts/generateFinderHooks.js` | same as above | per-finder `*Queries.generated.ts` | ✗ | MEDIUM |
| `tools/gui-react/scripts/generateManifestTypes.js` | `settingsRegistry.js` | `runtimeSettingsManifestTypes.ts` + backend `settingsDefaults.d.ts` | ✗ | MEDIUM |
| `tools/gui-react/scripts/generateLlmPolicyAdapter.js` | `llmPolicySchema.js`, `settingsRegistry.js` | `llmPolicyAdapter.generated.ts` | ✗ | MEDIUM |
| `tools/gui-react/scripts/generateRuntimeStageKeys.js` | `runtimeStageDefs.js` | 3 stage-keys generated files | ✗ | MEDIUM |
| `tools/gui-react/scripts/generateProductTypes.js` | `catalogShapes.js`, `productShapes.js` | `product.generated.ts` | ✗ | LOW |
| `tools/gui-react/scripts/generateReviewTypes.js` | `reviewFieldContract.js`, `componentReviewShapes.js` | `review.generated.ts`, `componentReview.generated.ts` | ✗ | LOW |
| `tools/gui-react/scripts/generateRuntimeOpsTypes.js` | 3 runtime-ops contracts | `runtime-ops/types.generated.ts` (35+ interfaces) | ✗ | LOW |
| `tools/gui-react/scripts/generateAutomationQueueTypes.js` | `automationQueueContract.js` | `indexing/types.generated.ts` | ✗ | LOW |
| `generate-studio-types.js` (root) | `studioSchemas.js` (zod) | `tools/gui-react/src/types/studio.ts` | **✓ at GUI build** | MEDIUM |

35+ `*.generated.*` files committed to git.

## Identified gaps

### G1. No CI / pre-commit `git diff --exit-code` after codegen — **HIGH**
Nothing prevents committing a stale generated file. A developer adds a phase to `llmPhaseDefs.js`, forgets to run `generateLlmPhaseRegistry.js`, and the frontend ships with stale types — TypeScript may even compile because the unchanged types still satisfy.

**Fix shape:** add a one-liner CI step (or pre-push hook) that runs all codegen, then `git diff --exit-code`. Fail build if anything changed.

### G2. No "regen all" entry point — MEDIUM
There's no `npm run codegen` or equivalent at the repo root that runs all 11 scripts. Developers must remember the list.

**Fix shape:** add `npm run codegen` at root that fans out to each generator. Keep the order documented (e.g., schemas → adapters → types → hooks).

### G3. `generateLlmPhaseRegistry` is a super-generator — MEDIUM
Single script, 10 outputs, 3 input registries. Highest drift surface area; touching any of the three inputs requires running the script.

**Fix shape:** keep as one script for transactional generation, but raise its priority in the pre-commit hook (always run first) so the 10 dependent files never desync.

### G4. Opt-in finder typegen creates two-tier reality — MEDIUM
`generateFinderTypes` and `generateFinderHooks` only emit for finders with `getResponseSchemaExport`. CEF and PIF hand-write their types and hooks. Two patterns side-by-side invite drift over time.

**Fix shape:** decide intent. Either (a) generate for all finders and let CEF/PIF supply schemas, or (b) document the boundary and lint that hand-written files don't masquerade as `.generated.ts`.

### G5. `generate-studio-types.js` is the only build-coupled generator — LOW
Auto-runs at GUI build. Inconsistent with the other 10 that are manual.

**Fix shape:** unify under the `npm run codegen` entry; or move studio-types into the same script registry so build-time invocation pulls them all.

### G6. Uncodegen'd registries that probably should be — LOW-MEDIUM
9 backend registries with no frontend codegen:
- `eventRegistry.js` (frontend may hardcode event names — already a noted risk)
- `commandRegistry.js`
- `unitRegistry.js`
- `sourceRegistry.js`
- (plus backend-only: `adapterRegistry`, `pluginRegistry`, `consumerBadgeRegistry`, `formatRegistry`, `typeCoercionRegistry`)

`eventRegistry` is the priority: frontend already references event names as string literals. Codegen would catch typos and unmapped events at build time.

**Fix shape:** generate `EVENT_NAMES` enum from the backend registry; replace string literals; let TS catch drift.

### G7. `tsconfig.tsbuildinfo` committed — LOW
File appears in git status; this is the TypeScript incremental build cache. Either keep committed (faster cold builds) or gitignore.

**Fix shape:** policy decision; either is fine. Document and stick to one.

### G8. Test coverage for codegen scripts is sparse — LOW
Only 2 of 11 generators have tests (`generateFinderTypes`, `generateFinderHooks`).

**Fix shape:** add a smoke test per generator: run it on the canonical input, snapshot the output, fail on diff.

## Confirmed-good patterns

- 35 `.generated.*` files are committed (not gitignored) — the diff visibility is itself a drift safeguard if reviewers pay attention.
- `generate-studio-types` running at build time is the right pattern for the others to follow.
- Shape descriptors in `catalogShapes.js`, `reviewFieldContract.js`, `runtimeOpsContract.js` give a clean codegen → TS interface path.

## Recommended fix order

1. **G1** — CI / pre-commit `git diff --exit-code` after codegen. Single highest-value fix.
2. **G2** — `npm run codegen` aggregator at root.
3. **G6** — codegen `EVENT_NAMES` from `eventRegistry.js`; replace string literals.
4. **G4** — pick a model for opt-in vs. universal finder typegen.
5. **G8** — add smoke tests for each generator.
6. **G3** — keep as-is but document it leads the codegen pipeline.
7. **G5, G7** — minor cleanup.
