# Spec Factory Documentation

> **Purpose:** Provide the master table of contents and strict reading order for the maintained LLM-first documentation set.
> **Prerequisites:** `../CLAUDE.md`
> **Last validated:** 2026-04-04

Spec Factory is a local-first product-spec indexing, review, authority-authoring, and runtime-operations workbench. The live runtime is assembled in `src/app/api/guiServerRuntime.js`, started by `src/app/api/guiServer.js`, served to the browser from `tools/gui-react/dist/`, backed by `.workspace/db/app.sqlite` plus `.workspace/db/<category>/spec.sqlite`, and extended by feature-first backend code under `src/features/` and GUI code under `tools/gui-react/src/features/`.

## LLM Reading Order

1. `README.md`
2. `01-project-overview/scope.md`
3. `01-project-overview/folder-map.md`
4. `01-project-overview/conventions.md`
5. `02-dependencies/stack-and-toolchain.md`
6. `02-dependencies/environment-and-config.md`
7. `02-dependencies/external-services.md`
8. `03-architecture/system-map.md`
9. `03-architecture/backend-architecture.md`
10. `03-architecture/frontend-architecture.md`
11. `03-architecture/data-model.md`
12. `03-architecture/auth-and-sessions.md`
13. `04-features/feature-index.md`
14. the relevant file(s) under `04-features/`
15. `07-patterns/canonical-examples.md`
16. `07-patterns/anti-patterns.md`
17. remaining operations and reference docs as needed

## Table Of Contents

### 01. Project Overview

- [Scope](./01-project-overview/scope.md) - live system boundary, non-goals, and validation baseline.
- [Folder Map](./01-project-overview/folder-map.md) - annotated repo tree and fast navigation hints.
- [Conventions](./01-project-overview/conventions.md) - repo rules, ownership boundaries, and extension points.
- [Glossary](./01-project-overview/glossary.md) - project-specific domain terms and overloaded names.

### 02. Dependencies

- [Stack and Toolchain](./02-dependencies/stack-and-toolchain.md) - exact languages, runtimes, package managers, and direct dependency identities.
- [External Services](./02-dependencies/external-services.md) - verified external and out-of-process integrations.
- [Environment and Config](./02-dependencies/environment-and-config.md) - config SSOT chain, persistence targets, and mutable settings surfaces.
- [Setup and Installation](./02-dependencies/setup-and-installation.md) - verified local setup and smoke-validation flow.

### 03. Architecture

- [System Map](./03-architecture/system-map.md) - runtime topology and major boundaries.
- [Backend Architecture](./03-architecture/backend-architecture.md) - server bootstrap, route layers, process runtime, and backend call graph.
- [Frontend Architecture](./03-architecture/frontend-architecture.md) - SPA runtime, routing, state, data fetching, and component hierarchy.
- [Routing and GUI](./03-architecture/routing-and-gui.md) - path-to-page map, layouts, and client/server interaction boundaries.
- [Data Model](./03-architecture/data-model.md) - schema, relationships, migrations, canonical vs derived state.
- [Auth and Sessions](./03-architecture/auth-and-sessions.md) - current trust model and verified absence of auth/session middleware.

### 04. Features

- [Feature Index](./04-features/feature-index.md) - complete lookup table of first-class features and their key files.
- [Category Authority](./04-features/category-authority.md) - category control-plane authoring and sync surfaces.
- [Catalog and Product Selection](./04-features/catalog-and-product-selection.md) - category/product browsing and selection flows.
- [Color Registry](./04-features/color-registry.md) - global color registry and color-edition lookup flows.
- [Field Rules Studio](./04-features/field-rules-studio.md) - rule authoring, map editing, and studio persistence.
- [Indexing Lab](./04-features/indexing-lab.md) - crawl run launch, run inspection, and analytics surfaces.
- [LLM Policy and Provider Config](./04-features/llm-policy-and-provider-config.md) - global LLM policy editing and provider routing metadata.
- [Pipeline and Runtime Settings](./04-features/pipeline-and-runtime-settings.md) - runtime, source-strategy, and spec-seed settings flows.
- [Runtime Ops](./04-features/runtime-ops.md) - live process telemetry and diagnostics.
- [Review Workbench](./04-features/review-workbench.md) - scalar, component, and enum review workflows.
- [Billing and Learning](./04-features/billing-and-learning.md) - billing rollups and learning artifacts.
- [Storage and Run Data](./04-features/storage-and-run-data.md) - storage inventory, run deletion, and export surfaces.
- [Test Mode](./04-features/test-mode.md) - isolated test-category and fixture workflows.

### 05. Operations

- [Deployment](./05-operations/deployment.md) - build, package, and launch surfaces.
- [Monitoring and Logging](./05-operations/monitoring-and-logging.md) - health surfaces, logs, and runtime observability.
- [Known Issues](./05-operations/known-issues.md) - current bugs, drift, and operational hazards.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - file-by-file doc dispositions and audit evidence.
- [Spec Factory Knobs Maintenance](./05-operations/spec_factory_knobs_maintenance.md) - settings-specific maintenance notes and guardrails.

### 06. References

- [API Surface](./06-references/api-surface.md) - endpoint inventory with ownership and request/response shapes.
- [Background Jobs](./06-references/background-jobs.md) - long-running processes, helper servers, and runtime jobs.
- [Integration Boundaries](./06-references/integration-boundaries.md) - contracts where this repo meets external systems.

### 07. Patterns

- [Canonical Examples](./07-patterns/canonical-examples.md) - copyable project-native examples for common tasks.
- [Anti-Patterns](./07-patterns/anti-patterns.md) - explicit patterns to avoid and the correct replacements.

## First-Pass Facts

- Server entrypoints:
  - `src/app/api/guiServer.js`
  - `src/app/api/guiServerRuntime.js`
- GUI route SSOT:
  - `tools/gui-react/src/registries/pageRegistry.ts`
- Backend route-order SSOT:
  - `src/app/api/guiServerRuntime.js`
- Runtime settings SSOT:
  - `src/shared/settingsRegistry.js`
- Live `/storage/*` endpoints are delegated inside:
  - `src/features/indexing/api/indexlabRoutes.js`
- Current persistent stores:
  - `.workspace/db/app.sqlite`
  - `.workspace/db/<category>/spec.sqlite`

## Current Validation Snapshot

- `npm run env:check` failed on 2026-04-04 with `Missing keys in config manifest: PORT`.
- `npm run gui:build` passed on 2026-04-04.
- `npm test` passed on 2026-04-04 with `6803` tests and `0` failures.
- Runtime smoke on 2026-04-04 confirmed:
  - `GET /health` -> `200`
  - `GET /api/v1/categories` -> `["keyboard","monitor","mouse"]`
  - `GET /api/v1/process/status` -> `200`
  - `GET /api/v1/storage/overview` -> `200`, `storage_backend: "local"`

## Current-State Docs vs Supporting Artifacts

- First-pass current-state authority:
  - `../CLAUDE.md`
  - `01-project-overview/` through `07-patterns/`
- Supporting but not first-pass authority:
  - `audits/`
  - `implementation/`
  - `data-structure/`

## Supporting Audit And History Artifacts

- [Base Model Contract Audit](./audits/base-model-contract-audit-2026-04-04.md) - targeted contract audit for the current `base_model` identity split.
- [Field Catalog Seed Retirement Audit](./audits/field-catalog-seed-retirement-audit-2026-04-04.md) - targeted retirement audit for the dead `_source` seed artifact.
- [Product SSOT Validation Audit](./audits/product-ssot-validation-2026-04-02.md) - targeted audit for the `product.json` and queue SQL SSOT migration.
- [Implementation Assets](./implementation/README.md) - historical and supplemental implementation subtree; not part of the numbered reading order.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `../CLAUDE.md` | external LLM entrypoint and reading-order alignment |
| source | `src/app/api/guiServer.js` | live server entrypoint path |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly and route-order path |
| source | `src/app/cli/spec.js` | CLI entrypoint |
| source | `tools/gui-react/src/App.tsx` | GUI shell and standalone `/test-mode` route |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route and tab inventory |
| source | `src/features/indexing/api/indexlabRoutes.js` | `/storage/*` delegation path |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage inventory and maintenance endpoints |
| command | `npm run env:check` | failing env-check baseline on 2026-04-04 |
| command | `npm run gui:build` | successful GUI build baseline on 2026-04-04 |
| command | `npm test` | successful full-suite baseline on 2026-04-04 |
| runtime | `GET /health` | live health smoke result on 2026-04-04 |
| runtime | `GET /api/v1/storage/overview` | live storage smoke result on 2026-04-04 |

## Related Documents

- [../CLAUDE.md](../CLAUDE.md) - compact LLM truth file that points back into this full docs tree.
- [Scope](./01-project-overview/scope.md) - system boundary and non-goals.
- [API Surface](./06-references/api-surface.md) - endpoint inventory referenced by many feature and architecture docs.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - file-level audit record for this docs rebuild.
