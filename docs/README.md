# Spec Factory Documentation

> **Purpose:** Master entrypoint for the LLM-oriented current-state documentation set for this repository.
> **Prerequisites:** None.
> **Last validated:** 2026-03-31

Spec Factory is a local-first Node.js plus React workbench for crawl-first product-spec indexing, review, category-authority maintenance, and runtime diagnostics. The live server is assembled in `src/api/guiServerRuntime.js`, served through `src/api/guiServer.js`, mounts `/api/v1/*` plus `/ws`, serves the built GUI from `tools/gui-react/dist/`, persists global state in `.workspace/db/app.sqlite`, persists per-category state in `.workspace/db/<category>/spec.sqlite`, and reads authored control-plane files from `category_authority/`.

## LLM Reading Order

1. `README.md` (this file)
2. [01-project-overview/scope.md](./01-project-overview/scope.md)
3. [01-project-overview/folder-map.md](./01-project-overview/folder-map.md)
4. [01-project-overview/conventions.md](./01-project-overview/conventions.md)
5. [01-project-overview/glossary.md](./01-project-overview/glossary.md)
6. [02-dependencies/stack-and-toolchain.md](./02-dependencies/stack-and-toolchain.md)
7. [02-dependencies/environment-and-config.md](./02-dependencies/environment-and-config.md)
8. [02-dependencies/external-services.md](./02-dependencies/external-services.md)
9. [02-dependencies/setup-and-installation.md](./02-dependencies/setup-and-installation.md)
10. [03-architecture/system-map.md](./03-architecture/system-map.md)
11. [03-architecture/backend-architecture.md](./03-architecture/backend-architecture.md)
12. [03-architecture/frontend-architecture.md](./03-architecture/frontend-architecture.md)
13. [03-architecture/routing-and-gui.md](./03-architecture/routing-and-gui.md)
14. [03-architecture/data-model.md](./03-architecture/data-model.md)
15. [03-architecture/auth-and-sessions.md](./03-architecture/auth-and-sessions.md)
16. [04-features/feature-index.md](./04-features/feature-index.md)
17. Choose the relevant feature doc from [04-features/feature-index.md](./04-features/feature-index.md)
18. [07-patterns/canonical-examples.md](./07-patterns/canonical-examples.md)
19. [07-patterns/anti-patterns.md](./07-patterns/anti-patterns.md)
20. [05-operations/known-issues.md](./05-operations/known-issues.md)
21. [06-references/api-surface.md](./06-references/api-surface.md)

## Table Of Contents

### 01. Project Overview

- [Scope](./01-project-overview/scope.md)
- [Folder Map](./01-project-overview/folder-map.md)
- [Conventions](./01-project-overview/conventions.md)
- [Glossary](./01-project-overview/glossary.md)

### 02. Dependencies

- [Stack and Toolchain](./02-dependencies/stack-and-toolchain.md)
- [External Services](./02-dependencies/external-services.md)
- [Environment and Config](./02-dependencies/environment-and-config.md)
- [Setup and Installation](./02-dependencies/setup-and-installation.md)

### 03. Architecture

- [System Map](./03-architecture/system-map.md)
- [Backend Architecture](./03-architecture/backend-architecture.md)
- [Frontend Architecture](./03-architecture/frontend-architecture.md)
- [Routing and GUI](./03-architecture/routing-and-gui.md)
- [Data Model](./03-architecture/data-model.md)
- [Auth and Sessions](./03-architecture/auth-and-sessions.md)

### 04. Features

- [Feature Index](./04-features/feature-index.md)
- [Category Authority](./04-features/category-authority.md)
- [Catalog and Product Selection](./04-features/catalog-and-product-selection.md)
- [Field Rules Studio](./04-features/field-rules-studio.md)
- [Indexing Lab](./04-features/indexing-lab.md)
- [LLM Policy and Provider Config](./04-features/llm-policy-and-provider-config.md)
- [Pipeline and Runtime Settings](./04-features/pipeline-and-runtime-settings.md)
- [Runtime Ops](./04-features/runtime-ops.md)
- [Review Workbench](./04-features/review-workbench.md)
- [Billing and Learning](./04-features/billing-and-learning.md)
- [Storage and Run Data](./04-features/storage-and-run-data.md)
- [Test Mode](./04-features/test-mode.md)

### 05. Operations

- [Deployment](./05-operations/deployment.md)
- [Monitoring and Logging](./05-operations/monitoring-and-logging.md)
- [Known Issues](./05-operations/known-issues.md)
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md)
- [Spec Factory Knobs Maintenance](./05-operations/spec_factory_knobs_maintenance.md)

### 06. References

- [API Surface](./06-references/api-surface.md)
- [Background Jobs](./06-references/background-jobs.md)
- [Integration Boundaries](./06-references/integration-boundaries.md)

### 07. Patterns

- [Canonical Examples](./07-patterns/canonical-examples.md)
- [Anti-Patterns](./07-patterns/anti-patterns.md)

## Excluded Subtrees

- `docs/implementation/` exists on disk but was explicitly excluded from this pass. Do not use it as current-state authority unless a separate task re-audits it.
- `docs/data-structure/` exists on disk but was explicitly excluded from this pass. Do not use it as current-state authority unless a separate task re-audits it.

## Current Validation Snapshot

- `npm run gui:build` succeeded on 2026-03-31.
- `npm test` succeeded on 2026-03-31.
- `npm run env:check` failed on 2026-03-31 with `Missing keys in config manifest: PORT`.
- Runtime validation on 2026-03-31 confirmed live responses from `/health`, `/api/v1/categories`, `/api/v1/process/status`, `/api/v1/runtime-settings`, `/api/v1/llm-policy`, and `/api/v1/storage/overview`.
- `GET /api/v1/categories` returned `["keyboard","monitor","mouse"]`; `category_authority/tests/`, `_global/`, `_runtime/`, and `_test_mouse/` are present on disk but filtered from the default categories API.
- `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` remain unauthenticated and can expose secret-bearing fields when configured.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | live server assembly, route order SSOT, runtime metadata roots |
| source | `src/api/guiServer.js` | thin process entrypoint that serves the GUI runtime |
| source | `tools/gui-react/src/App.tsx` | HashRouter shell and standalone `/test-mode` mount |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route and tab inventory SSOT |
| source | `src/app/api/routes/infra/categoryRoutes.js` | categories endpoint filters `tests` by default |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | live runtime-settings surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | live LLM policy surface |
| source | `src/features/indexing/api/storageManagerRoutes.js` | live storage-manager surface reports local backend metadata |
| source | `src/db/appDbSchema.js` | global `app.sqlite` persistence boundary |
| config | `package.json` | root scripts and backend dependency surface |
| config | `tools/gui-react/package.json` | GUI scripts and frontend dependency surface |
| command | `npm run env:check` | failing March 31 baseline caused by missing `PORT` in `.env.example` |
| command | `npm run gui:build` | successful March 31 GUI build baseline |
| command | `npm test` | successful March 31 full-suite baseline |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory excludes harness and underscored directories by default |
| runtime | `http://127.0.0.1:8788/api/v1/runtime-settings` | live unauthenticated runtime-settings contract |
| runtime | `http://127.0.0.1:8788/api/v1/llm-policy` | live unauthenticated LLM policy contract |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | live storage overview reports `storage_backend: "local"` |

## Related Documents

- [Scope](./01-project-overview/scope.md) - Defines what this repo is and what it explicitly is not.
- [Folder Map](./01-project-overview/folder-map.md) - Fast path to the live directory layout and ownership boundaries.
- [System Map](./03-architecture/system-map.md) - Topology view after orientation.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - File-by-file disposition record for this refresh.
