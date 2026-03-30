# Spec Factory Documentation

> **Purpose:** Master entrypoint for the LLM-oriented current-state documentation set for this repository.
> **Prerequisites:** None.
> **Last validated:** 2026-03-30

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

### Supplemental

- [Pipeline Audit 2026-03-25](./03-architecture/PIPELINE-AUDIT-2026-03-25.md)
- [Structural Audit 2026-03-23](./03-architecture/STRUCTURAL-AUDIT-2026-03-23.md)
- [Structural Audit 2026-03-24](./03-architecture/STRUCTURAL-AUDIT-2026-03-24.md)
- [App API Wiring Audit](./test-audit/app-api-wiring-audit.md)
- [App UI Component Audit](./test-audit/app-ui-component-audit.md)

## Excluded Subtree

- `docs/implementation/` exists on disk but is explicitly excluded from this pass and from the current-state reading order. Do not use it as live authority unless a separate task re-audits it.

## Current Validation Snapshot

- `npm run gui:build` succeeded on 2026-03-30.
- `npm run env:check` failed on 2026-03-30 with `Missing keys in config manifest: PORT`.
- `npm test` failed on 2026-03-30; see [05-operations/known-issues.md](./05-operations/known-issues.md) for the currently observed failing areas.
- `GET http://127.0.0.1:8788/api/v1/categories` returned `["keyboard","monitor","mouse"]` on 2026-03-30. `category_authority/tests/` exists on disk but is intentionally filtered from the default categories API.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | live server assembly, route order SSOT, runtime metadata roots |
| source | `src/api/guiServer.js` | thin process entrypoint that serves the GUI runtime |
| source | `tools/gui-react/src/App.tsx` | HashRouter shell and standalone `/test-mode` mount |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route and tab inventory SSOT |
| source | `src/app/api/routes/infra/categoryRoutes.js` | categories endpoint filters `tests` by default |
| source | `src/db/appDbSchema.js` | global `app.sqlite` persistence boundary |
| config | `package.json` | root scripts and backend dependency surface |
| config | `tools/gui-react/package.json` | GUI scripts and frontend dependency surface |
| command | `npm run env:check` | failing March 30 baseline caused by missing `PORT` in `.env.example` |
| command | `npm run gui:build` | successful March 30 GUI build baseline |
| command | `npm test` | failing March 30 suite baseline |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory excludes the `tests` harness directory by default |

## Related Documents

- [Scope](./01-project-overview/scope.md) - Defines what this repo is and what it explicitly is not.
- [Folder Map](./01-project-overview/folder-map.md) - Fast path to the live directory layout and ownership boundaries.
- [System Map](./03-architecture/system-map.md) - Topology view after orientation.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - File-by-file disposition record for this refresh.
