# Spec Factory Documentation

> **Purpose:** Provide the master table of contents and strict reading order for the maintained LLM-first documentation set.
> **Prerequisites:** [../CLAUDE.md](../CLAUDE.md)
> **Last validated:** 2026-04-10

Spec Factory is a local-first product-spec indexing, review, authority-authoring, publisher-validation, and runtime-operations workbench. The live system is assembled in `src/app/api/guiServerRuntime.js`, launched by `src/app/api/guiServer.js`, served to the browser from `tools/gui-react/dist/`, backed by `.workspace/db/app.sqlite` plus `.workspace/db/<category>/spec.sqlite`, and organized around backend feature boundaries under `src/features/` and GUI feature/page modules under `tools/gui-react/src/`.

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

- [Scope](./01-project-overview/scope.md) - live system boundary, target users, non-goals, and validation baseline.
- [Folder Map](./01-project-overview/folder-map.md) - annotated repo tree and fast navigation hints.
- [Conventions](./01-project-overview/conventions.md) - repo rules, extension points, and anti-assumptions.
- [Glossary](./01-project-overview/glossary.md) - project-specific domain terms and overloaded names.

### 02. Dependencies

- [Stack and Toolchain](./02-dependencies/stack-and-toolchain.md) - exact runtimes, package managers, frameworks, and direct dependencies.
- [External Services](./02-dependencies/external-services.md) - verified third-party and out-of-process integrations.
- [Environment and Config](./02-dependencies/environment-and-config.md) - config SSOT chain, env inventory, and mutable settings surfaces.
- [Setup and Installation](./02-dependencies/setup-and-installation.md) - verified local setup and smoke-validation flow.

### 03. Architecture

- [System Map](./03-architecture/system-map.md) - runtime topology and major boundaries.
- [Backend Architecture](./03-architecture/backend-architecture.md) - server bootstrap, route layers, realtime, and persistence boundaries.
- [Frontend Architecture](./03-architecture/frontend-architecture.md) - SPA runtime, routing, state, and client transport boundaries.
- [Routing and GUI](./03-architecture/routing-and-gui.md) - path-to-page map, layouts, and client/server boundaries.
- [Data Model](./03-architecture/data-model.md) - AppDb and SpecDb schema, migrations, and canonical-vs-derived state.
- [Auth and Sessions](./03-architecture/auth-and-sessions.md) - current trust model and verified absence of auth/session middleware.

### 04. Features

- [Feature Index](./04-features/feature-index.md) - complete lookup table of first-class features and key files.
- [Category Authority](./04-features/category-authority.md) - category control-plane freshness and sync surfaces.
- [Catalog and Product Selection](./04-features/catalog-and-product-selection.md) - category/product browsing and mutation flows.
- [Overview Command Console](./04-features/overview-command-console.md) - bulk per-finder dispatch, smart-select, Score Card, and full-pipeline orchestrator on the `/` route.
- [Color Registry](./04-features/color-registry.md) - global color registry and product-scoped color-edition discovery.
- [Unit Registry](./04-features/unit-registry.md) - global managed units, synonyms, and conversion rules.
- [Field Rules Studio](./04-features/field-rules-studio.md) - studio map, known-values, and compile/validate flows.
- [Indexing Lab](./04-features/indexing-lab.md) - run launch, run inspection, and analytics surfaces.
- [Publisher](./04-features/publisher.md) - candidate validation audit log and publisher pipeline ownership.
- [Review Workbench](./04-features/review-workbench.md) - scalar, component, and enum review workflows.
- [LLM Policy and Provider Config](./04-features/llm-policy-and-provider-config.md) - global LLM policy and provider-routing metadata.
- [Pipeline and Runtime Settings](./04-features/pipeline-and-runtime-settings.md) - runtime, source-strategy, and spec-seed settings flows.
- [Runtime Ops](./04-features/runtime-ops.md) - live process telemetry and diagnostics.
- [Billing and Learning](./04-features/billing-and-learning.md) - billing rollups and learning artifacts.
- [Storage and Run Data](./04-features/storage-and-run-data.md) - storage inventory, export, and destructive maintenance.
- [Test Mode](./04-features/test-mode.md) - isolated field contract audit and `_test_*` category workflows.

### 05. Operations

- [Deployment](./05-operations/deployment.md) - build, packaging, and local promotion surfaces.
- [Monitoring and Logging](./05-operations/monitoring-and-logging.md) - health endpoints, telemetry sinks, and websocket observability.
- [Known Issues](./05-operations/known-issues.md) - current bugs, drifts, and operational hazards.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - file-by-file doc disposition and proof log.
- [Spec Factory Knobs Maintenance](./05-operations/spec_factory_knobs_maintenance.md) - settings-specific maintenance guardrails.

### 06. References

- [API Surface](./06-references/api-surface.md) - endpoint inventory with ownership and request/response shapes.
- [Background Jobs](./06-references/background-jobs.md) - long-running jobs, child processes, and sidecars.
- [Integration Boundaries](./06-references/integration-boundaries.md) - where this system stops and external systems begin.

### 07. Patterns

- [Canonical Examples](./07-patterns/canonical-examples.md) - copyable project-native examples for common tasks.
- [Anti-Patterns](./07-patterns/anti-patterns.md) - explicit patterns to avoid and the correct replacements.

## High-Signal Facts

- Backend route SSOT:
  - `src/app/api/guiServerRuntime.js`
  - live mounted families: `17`
- GUI route SSOT:
  - `tools/gui-react/src/registries/pageRegistry.ts`
  - tabbed routes: `18`
  - total GUI routes with `/test-mode`: `19`
- Runtime settings SSOT:
  - `src/shared/settingsRegistry.js`
  - `src/core/config/manifest/index.js`
- Persistent stores:
  - `.workspace/db/app.sqlite`
  - `.workspace/db/<category>/spec.sqlite`
  - `category_authority/`

## Current Validation Snapshot

- `npm run env:check` failed on 2026-04-10 with `Missing keys in config manifest: PORT`.
- `npm run gui:build` passed on 2026-04-10.
- `npm test` failed on 2026-04-10: `7788` tests, `7778` passed, `10` failed.
- Runtime smoke on 2026-04-10 confirmed:
  - `GET /health` -> `200`
  - `GET /api/v1/categories` -> `["keyboard","monitor","mouse"]`
  - `GET /api/v1/process/status` -> `200`, `running: false`, `storage_destination: "local"`
  - `GET /api/v1/storage/overview` -> `200`, `storage_backend: "local"`, `total_runs: 0`

## Scope Notes

- Excluded from this documentation pass and not part of the numbered reading order:
  - `docs/implementation/`
  - `docs/features-html/`
  - `docs/data-structure-html/`
- Historical audit artifacts retained as supporting evidence:
  - [Base Model Contract Audit](./audits/base-model-contract-audit-2026-04-04.md)
  - [Field Catalog Seed Retirement Audit](./audits/field-catalog-seed-retirement-audit-2026-04-04.md)
  - [Product SSOT Validation Audit](./audits/product-ssot-validation-2026-04-02.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `../CLAUDE.md` | root LLM entrypoint alignment |
| source | `src/app/api/guiServer.js` | live server entrypoint path |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly, route-family count, and metadata roots |
| source | `src/app/api/routeRegistry.js` | stale route-order constant vs live runtime |
| source | `tools/gui-react/src/App.tsx` | AppShell route mounting and `/test-mode` |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route inventory and grouped tabs |
| command | `npm run env:check` | env-check baseline on 2026-04-10 |
| command | `npm run gui:build` | successful GUI build on 2026-04-10 |
| command | `npm test` | full-suite result on 2026-04-10 |
| runtime | `GET /health` | live health response on 2026-04-10 |
| runtime | `GET /api/v1/storage/overview` | live storage response on 2026-04-10 |

## Related Documents

- [../CLAUDE.md](../CLAUDE.md) - compact repo-root truth file.
- [Scope](./01-project-overview/scope.md) - project boundary and explicit non-goals.
- [Feature Index](./04-features/feature-index.md) - lookup table for the feature-level docs.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - file-level disposition record for this pass.
