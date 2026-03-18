# Known Issues

> **Purpose:** Record verified bugs, gaps, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-17

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled/seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use test mode to generate a seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/reviewRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| `src/indexlab/indexingSchemaPacketsValidator.js` defaults its schema root into the excluded `docs/implementation/ai-indexing-plans/schema/` subtree | moving or deleting those schema JSON files breaks packet validation even though the subtree is outside the maintained reading order | leave the schema files in place or pass an explicit `schemaRoot` when changing that dependency boundary | `src/indexlab/indexingSchemaPacketsValidator.js` |
| `buildProcessStartLaunchPlan()` no longer emits `LLM_MODEL_TRIAGE`, so the launch-plan contract test fails | `npm test` is not a green regression gate for GUI process-start changes | validate actual `envOverrides` behavior in `src/features/indexing/api/builders/processStartLaunchPlan.js` before relying on the test expectation | `src/features/indexing/api/tests/processStartLaunchPlan.test.js`, `src/features/indexing/api/builders/processStartLaunchPlan.js` |
| `runExtractionVerification()` currently uses `config.llmModelPlan` for both verification calls, while the test still expects distinct fast/reasoning models | extraction verification tests fail and no longer match the audited implementation | treat `src/features/indexing/extraction/runExtractionVerification.js` as the current runtime truth until code changes are commissioned | `src/features/indexing/extraction/tests/runExtractionVerification.test.js`, `src/features/indexing/extraction/runExtractionVerification.js` |
| `buildIndexingRunModelPayload()` omits extract/validate/write fallback model fields expected by the GUI test | the indexing run payload test is red and the current payload surface is narrower than the test fixture assumes | inspect `tools/gui-react/src/features/indexing/api/indexingRunModelPayload.ts` before adding or consuming fallback-model payload keys | `tools/gui-react/src/features/indexing/api/__tests__/indexingRunModelPayload.test.ts`, `tools/gui-react/src/features/indexing/api/indexingRunModelPayload.ts` |
| Several GUI state tests fail under `node --test` because TypeScript ESM modules import sibling files without explicit `.ts` extensions | `llm-config` and `pipeline-settings` state-module tests fail before assertions run, so the current Node ESM harness is not a complete proof path for those modules | use `npm run gui:build` and targeted runtime checks as the current proof path, and treat these test failures as active import-resolution debt | `tools/gui-react/src/features/llm-config/state/llmPreflightValidation.ts`, `tools/gui-react/src/features/llm-config/state/llmMixDetection.ts`, `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts`, `tools/gui-react/src/features/llm-config/state/__tests__/*.ts`, `tools/gui-react/src/features/pipeline-settings/state/__tests__/*.ts` |
| `npm run env:check` now passes, but it only scans the fixed `FILES_TO_SCAN` list in `tools/check-env-example-sync.mjs`, including two paths that no longer exist | a passing env-check is not a full manifest-completeness guarantee and can be misread as stronger coverage than it actually provides | treat `src/core/config/manifest/*.js` and `src/config.js` as the SSOT, and treat `env:check` as a narrow reference scan only | `tools/check-env-example-sync.mjs`, `src/config.js`, `src/core/config/manifest/*.js` |

## Notes

- Current proof snapshot on 2026-03-17:
  - `npm run gui:build` passes.
  - `npm run env:check` passes with `OK (3 referenced keys covered)`.
  - `npm test` reports `6313` pass, `11` fail, `1` skipped.
- Auth-related environment variables exist, but no verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/reviewRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | seeded-runtime expectations for runtime panels |
| source | `src/indexlab/indexingSchemaPacketsValidator.js` | runtime dependency on excluded schema assets |
| source | `src/features/indexing/api/builders/processStartLaunchPlan.js` | current process-start env-override behavior |
| test | `src/features/indexing/api/tests/processStartLaunchPlan.test.js` | failing launch-plan expectation against current implementation |
| source | `src/features/indexing/extraction/runExtractionVerification.js` | current verification-model selection behavior |
| test | `src/features/indexing/extraction/tests/runExtractionVerification.test.js` | failing extraction verification expectations |
| source | `tools/gui-react/src/features/indexing/api/indexingRunModelPayload.ts` | current indexing run model payload shape |
| test | `tools/gui-react/src/features/indexing/api/__tests__/indexingRunModelPayload.test.ts` | failing fallback-model payload expectations |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env-check behavior and stale scan list |
| source | `tools/gui-react/src/features/llm-config/state/llmPreflightValidation.ts` | extensionless sibling imports in current GUI state modules |
| source | `tools/gui-react/src/features/llm-config/state/llmMixDetection.ts` | extensionless sibling imports in current GUI state modules |
| source | `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts` | extensionless sibling imports in current GUI state modules |
| command | `npm run env:check` | current env-check output is `OK (3 referenced keys covered)` |
| command | `npm test` | current full-suite baseline is red with 11 failures |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.
