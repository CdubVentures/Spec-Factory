# Scope

> **Purpose:** Define the live system boundary, target users, explicit non-goals, and validation baseline so an arriving LLM does not invent missing services.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-04-10

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

## What This Project Is

Spec Factory is a local-first operator workbench for category authority, catalog management, crawl/index runs, runtime diagnostics, publisher validation, review workflows, and settings management. The live runtime is a Node HTTP + WebSocket server that serves the built GUI, mounts `/api/v1/*` plus `/ws` from `src/app/api/guiServerRuntime.js`, and persists operational state in one global AppDb plus one SpecDb per category.

## Target Users And Current Status

| Item | Current state |
|------|---------------|
| Primary users | repository operators, category curators, review operators, and local development agents |
| Runtime posture | local-first workstation or trusted-network deployment |
| Product status | active internal/operator tool with current development drift in test coverage and route-registry metadata |

## What This Repo Is Not

- Not a hosted SaaS app. No cloud deployment manifests, multi-environment promotion config, or CI/CD workflow was verified.
- Not an authenticated multi-user system. No login, token issuance, cookie session middleware, or RBAC layer was verified.
- Not a Next.js, Remix, Astro, or SSR frontend.
- Not a cloud-storage-first system in the current implementation. The verified storage backend is local filesystem storage.
- Not a repo with a checked-in `.env.example`. The observed bootstrap file is `.env`.

## Runtime Surfaces

| Operator concern | GUI / CLI surface | Primary files |
|------------------|-------------------|---------------|
| Overview + product detail | `/#/`, `/#/product` | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx` |
| Category + catalog setup | `/#/categories`, `/#/catalog`, CLI discovery flows | `tools/gui-react/src/features/catalog/components/CategoryManager.tsx`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`, `src/app/cli/commands/discoverCommand.js` |
| Brand + color + unit registries | `/#/brands`, `/#/colors`, `/#/units` | `tools/gui-react/src/features/studio/components/BrandManager.tsx`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx`, `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx` |
| Crawl + indexing runs | `/#/indexing`, `indexlab` | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `src/app/cli/commands/pipelineCommands.js` |
| Runtime diagnostics | `/#/runtime-ops` | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Publisher audit log | `/#/publisher` | `tools/gui-react/src/pages/publisher/PublisherPage.tsx`, `src/features/publisher/api/publisherRoutes.js` |
| Review workflows | `/#/review`, `/#/review-components`, `/#/llm-settings`, `review *` commands | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `src/app/cli/commands/reviewCommand.js` |
| Studio / authority authoring | `/#/studio`, `compile-rules`, `validate-rules` | `tools/gui-react/src/features/studio/components/StudioPage.tsx`, `src/app/cli/commands/fieldRulesCommands.js` |
| Runtime + storage maintenance | `/#/storage`, `/#/runtime-ops`, `gui:api` | `tools/gui-react/src/pages/storage/StoragePage.tsx`, `src/features/indexing/api/storageManagerRoutes.js`, `src/app/api/guiServer.js` |
| Settings + provider config | `/#/llm-config`, `/#/pipeline-settings` | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| Billing | `/#/billing`, `billing-report` | `tools/gui-react/src/pages/billing/BillingPage.tsx`, `src/app/cli/commands/billingReportCommand.js` |
| Test mode / field contract audit | `/#/test-mode` | `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/test-mode/FieldContractAudit.tsx`, `src/app/api/routes/testModeRoutes.js` |

## Explicit Non-Goals And Absent Systems

- No verified `src/middleware/auth.*`, `src/auth/*`, `src/session/*`, or equivalent authenticated request boundary.
- No verified hosted object-store boundary in the current storage-manager API; runtime smoke reports `storage_backend: "local"`.
- No verified top-level `test/` directory in the current checkout.
- No verified Express/Fastify/Nest server. The live server uses Node `http` directly.
- No verified live `POST /api/v1/review/:category/finalize` route. The current client reference is stale.

## Validation Snapshot

| Proof | Result | Notes |
|------|--------|-------|
| `npm run gui:build` | pass | Validated on 2026-04-10. |
| `npm test` | fail | `7788` total, `7778` passed, `10` failed on 2026-04-10. |
| `npm run env:check` | fail | Reported `Missing keys in config manifest: PORT` on 2026-04-10. |
| `GET /health` | pass | Returned `200` with `service: "gui-server"` during runtime smoke on 2026-04-10. |
| `GET /api/v1/categories` | pass | Returned `["keyboard","monitor","mouse"]` during runtime smoke on 2026-04-10. |
| `GET /api/v1/process/status` | pass | Returned `200` with `running: false` and `storage_destination: "local"` during runtime smoke on 2026-04-10. |
| `GET /api/v1/storage/overview` | pass | Returned `200` with `storage_backend: "local"` and `total_runs: 0` during runtime smoke on 2026-04-10. |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | live server entrypoint |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly and route-family count |
| source | `src/app/cli/spec.js` | CLI command surface |
| source | `tools/gui-react/src/App.tsx` | SPA router model |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | operator-facing GUI page inventory |
| source | `src/features/indexing/api/storageManagerRoutes.js` | local storage backend reporting |
| source | `tools/check-env-example-sync.mjs` | env-check behavior and limitations |
| config | `package.json` | scripts, Node engine, and package identity |
| runtime | `GET /health` | server identity during runtime smoke on 2026-04-10 |
| runtime | `GET /api/v1/process/status` | runtime process status contract on 2026-04-10 |
| runtime | `GET /api/v1/storage/overview` | storage backend result on 2026-04-10 |

## Related Documents

- [Folder Map](./folder-map.md) - shows where each boundary in this scope statement lives on disk.
- [Conventions](./conventions.md) - defines the repo rules that constrain changes inside this scope.
- [System Map](../03-architecture/system-map.md) - expands this scope statement into runtime topology.
- [Known Issues](../05-operations/known-issues.md) - captures the live defects and drift discovered during validation.
