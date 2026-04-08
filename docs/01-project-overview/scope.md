# Scope

> **Purpose:** Define the live system boundary, entrypoints, and explicit non-goals so an arriving LLM does not invent missing services.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-04-07

## Reality Snapshot

| Concern | Live source of truth |
|---------|----------------------|
| Desktop/server entrypoint | `src/app/api/guiServer.js` |
| Server assembly | `src/app/api/guiServerRuntime.js` |
| CLI entrypoint | `src/app/cli/spec.js` |
| GUI source | `tools/gui-react/` |
| Root dependency manifest | `package.json` |
| GUI dependency manifest | `tools/gui-react/package.json` |
| Global SQLite | `.workspace/db/app.sqlite` via `src/app/api/bootstrap/createBootstrapSessionLayer.js` |
| Per-category SQLite | `.workspace/db/<category>/spec.sqlite` via `src/app/api/specDbRuntime.js` |
| Authored category control plane | `category_authority/` |
| Default run artifacts | `.workspace/runs/`, `.workspace/output/`, `.workspace/products/` via `src/core/config/runtimeArtifactRoots.js` |

## What This Repo Is

- A local-first operator workbench for category authority, crawl/index runs, review workflows, catalog maintenance, runtime operations, and settings management.
- A Node.js HTTP plus WebSocket runtime that serves the built GUI and mounts `/api/v1/*` plus `/ws` from `src/app/api/guiServerRuntime.js`, with 15 route families registered in `routeDefinitions`.
- A React/Vite/TypeScript GUI in `tools/gui-react/` rendered through `HashRouter` in `tools/gui-react/src/App.tsx`.
- A SQLite-backed system with one global app database plus per-category spec databases.
- A repo that also exposes CLI workflows from `src/app/cli/spec.js` with 10 commands: `indexlab`, `compile-rules`, `validate-rules`, `discover`, `review` (with subcommands), `export-overrides`, `migrate-overrides`, `billing-report`, `llm-health`, and `migrate-to-sqlite`.

## What This Repo Is Not

- Not a hosted SaaS app. No deployment manifests, hosted runtime topology, or CI/CD workflow was verified in the repo.
- Not an authenticated multi-user system. No request auth middleware, login flow, session issuance, or RBAC layer was verified.
- Not a Next.js, Remix, Astro, or server-rendered frontend.
- Not a cloud-storage-first system in the current implementation. The validated storage backend is local filesystem storage reported by `src/features/indexing/api/storageManagerRoutes.js`.
- Not a repo with a checked-in `.env.example`. The observed bootstrap file is `.env`; `npm run env:check` is a manifest-coverage script, not a template sync check.

## Operator Surfaces

| Operator concern | GUI / CLI surface | Primary files |
|------------------|-------------------|---------------|
| Overview + product detail | `/#/` (index), `/#/product` | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx` |
| Category + catalog setup | `/#/categories`, `/#/catalog`, `review layout`, `discover` | `tools/gui-react/src/features/catalog/components/CategoryManager.tsx`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`, `src/app/cli/commands/discoverCommand.js` |
| Brand + color management | `/#/brands`, `/#/colors` | `tools/gui-react/src/features/studio/components/BrandManager.tsx`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx` |
| Crawl + indexing runs | `/#/indexing`, `indexlab` | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `src/app/cli/commands/pipelineCommands.js` |
| Review workflows | `/#/review`, `/#/review-components`, `/#/llm-settings`, `review *` commands | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `src/app/cli/commands/reviewCommand.js` |
| Studio / authority authoring | `/#/studio`, `compile-rules`, `validate-rules` | `tools/gui-react/src/features/studio/components/StudioPage.tsx`, `src/app/cli/commands/fieldRulesCommands.js` |
| Runtime + storage maintenance | `/#/runtime-ops`, `/#/storage`, `gui:api` | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `src/features/indexing/api/storageManagerRoutes.js` |
| Settings + provider config | `/#/llm-config`, `/#/pipeline-settings` | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| Billing | `/#/billing`, `billing-report` | `tools/gui-react/src/pages/billing/BillingPage.tsx`, `src/app/cli/commands/billingReportCommand.js` |
| Test mode / field contract audit | `/#/test-mode` | `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/test-mode/FieldContractAudit.tsx`, `src/app/api/routes/testModeRoutes.js` |
| Publisher + discovery enums | (internal pipeline) | `src/features/publisher/index.js`, `src/features/publisher/buildDiscoveredEnumMap.js`, `src/features/publisher/persistDiscoveredValues.js`, `src/features/publisher/validation/mergeDiscoveredEnums.js` |

## Explicit Non-Goals And Absent Systems

- No verified `src/middleware/auth.*`, `src/auth/*`, `src/session/*`, or equivalent authenticated request boundary.
- No verified S3 runtime path in the current storage-manager API. `GET /api/v1/storage/overview` reports `storage_backend: "local"`.
- No verified top-level `data/` directory in the current checkout.
- No verified top-level Express/Fastify/Nest app. The live server uses Node `http` directly in `src/app/api/guiServerRuntime.js`.
- No verified backend route for `POST /api/v1/review/:category/finalize`. The finalize workflow has been removed from the backend review routes entirely.
- Intel Graph API has been deleted. The file `src/app/api/intelGraphApi.js` and its test `src/app/api/tests/intelGraphApi.test.js` no longer exist in the working tree.

## Validation Snapshot

| Proof | Result | Notes |
|------|--------|-------|
| `npm run gui:build` | pass | Validated on 2026-04-07. |
| `npm test` | pass | Validated on 2026-04-07. |
| `npm run env:check` | fail | Reported `Missing keys in config manifest: PORT` on 2026-04-07. |
| `GET /health` | pass | Returned `200` with `service: "gui-server"` during runtime smoke on 2026-04-07. |
| `GET /api/v1/categories` | pass | Returned `["keyboard","monitor","mouse"]` during runtime smoke on 2026-04-07. |
| `GET /api/v1/process/status` | pass | Returned `200` with `running: false` during runtime smoke on 2026-04-07. |
| `GET /api/v1/storage/overview` | pass | Returned `200` with `storage_backend: "local"` during runtime smoke on 2026-04-07. |

## Read Next

- [Folder Map](./folder-map.md)
- [Conventions](./conventions.md)
- [System Map](../03-architecture/system-map.md)
- [Known Issues](../05-operations/known-issues.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | live desktop/server entrypoint |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly and mounted route families |
| source | `src/app/cli/spec.js` | CLI command surface |
| source | `tools/gui-react/src/App.tsx` | SPA router model |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | operator-facing GUI page inventory |
| source | `src/features/indexing/api/storageManagerRoutes.js` | local storage backend reporting |
| source | `tools/check-env-example-sync.mjs` | env-check behavior and limitations |
| config | `package.json` | scripts, Node engine, primary entrypoint metadata |
| runtime | `GET /health` | server identity during runtime smoke on 2026-04-07 |
| runtime | `GET /api/v1/categories` | live category API result on 2026-04-07 |
| runtime | `GET /api/v1/process/status` | runtime process status contract on 2026-04-07 |
| runtime | `GET /api/v1/storage/overview` | storage backend result on 2026-04-07 |

## Related Documents

- [Folder Map](./folder-map.md) - shows where each boundary in this scope statement lives on disk.
- [Conventions](./conventions.md) - defines the repo rules that constrain changes inside this scope.
- [System Map](../03-architecture/system-map.md) - expands this scope statement into runtime topology.
- [Known Issues](../05-operations/known-issues.md) - captures the live defects and drift discovered during validation.
