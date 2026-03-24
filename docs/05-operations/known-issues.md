# Known Issues

> **Purpose:** Record verified bugs, gaps, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-23

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled/seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use test mode to generate a seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/reviewRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| Pipeline rework deleted ~300 files and ~24,000 LOC including the extraction pipeline, consensus engine, evidence audit, and learning gates | 77 test failures remain from contract drift; many tests reference deleted modules or changed APIs | treat `src/pipeline/runProduct.js` and `src/features/crawl/` as the current runtime truth | `src/pipeline/runProduct.js`, `src/features/crawl/index.js` |
| `src/evidence/` directory is empty (0 files) after deletion of `evidencePackV2.js` and `verifyEvidenceSpan.js` | evidence-related imports from other modules will fail at runtime | do not import from `src/evidence/`; evidence handling was removed in the pipeline rework | `src/evidence/` |
| `src/scoring/` reduced to 1 file after deletion of consensus engine, candidate merger, field aggregator, constraint solver, list union reducer, and quality scoring | scoring-related imports from other modules will fail | `src/scoring/index.js` is the only remaining file | `src/scoring/` |
| `src/adapters/` directory deleted entirely | adapter imports from the old path will fail | adapter functionality was consolidated or removed during the pipeline rework | formerly `src/adapters/` |
| Several GUI state tests fail under `node --test` because TypeScript ESM modules import sibling files without explicit `.ts` extensions | `llm-config` and `pipeline-settings` state-module tests fail before assertions run, so the current Node ESM harness is not a complete proof path for those modules | use `npm run gui:build` and targeted runtime checks as the current proof path, and treat these test failures as active import-resolution debt | `tools/gui-react/src/features/llm-config/state/llmPreflightValidation.ts`, `tools/gui-react/src/features/llm-config/state/llmMixDetection.ts`, `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts`, `tools/gui-react/src/features/llm-config/state/__tests__/*.ts`, `tools/gui-react/src/features/pipeline-settings/state/__tests__/*.ts` |
| `npm run env:check` now passes, but it only scans the fixed `FILES_TO_SCAN` list in `tools/check-env-example-sync.mjs`, including two paths that no longer exist | a passing env-check is not a full manifest-completeness guarantee and can be misread as stronger coverage than it actually provides | treat `src/core/config/manifest/*.js` and `src/config.js` as the SSOT, and treat `env:check` as a narrow reference scan only | `tools/check-env-example-sync.mjs`, `src/config.js`, `src/core/config/manifest/*.js` |
| `src/features/settings/api/settingsManifestBuilder.js` and its test `test/settingsManifestEndpoint.test.js` have been deleted | the settings manifest endpoint is no longer available; code referencing it will fail | use the settings authority and registry-driven settings routes instead | `src/features/settings/api/configRoutes.js`, `src/shared/settingsRegistry.js` |
| `src/adapters/tableParsing.js` moved to `src/features/indexing/extraction/parsers/tableParsing.js` | any imports from the old path will fail | update imports to use the new feature-scoped path | `src/features/indexing/extraction/parsers/tableParsing.js` |
| GUI helper files relocated from `src/pages/runtime-ops/` to feature-scoped locations | old import paths for `prefetchTooltipHelpers`, `domainClassifierHelpers`, `searchResultsHelpers`, and `runActivityScopeHelpers` no longer resolve | import from the new feature-scoped locations in `src/features/runtime-ops/` | `tools/gui-react/src/features/runtime-ops/` |
| `RUNTIME_SETTINGS_ROUTE_PUT — characterization` test fails consistently | the characterization test for the runtime settings PUT route does not match current implementation | investigate the settings route PUT contract drift | `src/features/settings/api/configRoutes.js` |

## Notes

- Current proof snapshot on 2026-03-23 (post-pipeline-rework):
  - `npm run gui:build` passes.
  - `npm run env:check` passes with `OK (3 referenced keys covered)`.
  - `npm test` reports `6555` pass, `77` fail (6632 total). The test count dropped from ~7693 to ~6632 because ~130 test files were deleted alongside the extraction pipeline, consensus engine, and evidence audit modules.
  - The pipeline has been fundamentally reworked: the extraction-heavy monolith was replaced by a crawl-first architecture (`src/features/crawl/`). Many test failures are expected drift from this rework.
- Auth-related environment variables exist, but no verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.
- `gaming_mice` category now exists alongside `keyboard`, `monitor`, and `mouse`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/reviewRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | seeded-runtime expectations for runtime panels |
| source | `src/pipeline/runProduct.js` | crawl-first pipeline orchestrator (248 LOC) |
| source | `src/features/crawl/index.js` | new crawl module public API |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env-check behavior and stale scan list |
| source | `tools/gui-react/src/features/llm-config/state/llmPreflightValidation.ts` | extensionless sibling imports in current GUI state modules |
| source | `tools/gui-react/src/features/llm-config/state/llmMixDetection.ts` | extensionless sibling imports in current GUI state modules |
| source | `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts` | extensionless sibling imports in current GUI state modules |
| command | `npm run env:check` | current env-check output is `OK (3 referenced keys covered)` |
| command | `npm test` | current full-suite baseline is red with 77 failures (6555 pass, 6632 total) |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.
