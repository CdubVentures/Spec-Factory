# Spec Factory Documentation

> **Purpose:** Master entrypoint for the LLM-oriented current-state documentation set for this repository.
> **Prerequisites:** None.
> **Last validated:** 2026-03-25

Spec Factory is a local-first product-spec indexing and review workbench. The live runtime is a Node.js HTTP/WebSocket server in `src/api/guiServer.js` that serves a Vite-built React GUI from `tools/gui-react/`, persists canonical operational data in SQLite through `src/db/specDb.js`, stores authored category and settings content under `category_authority/`, and orchestrates discovery, crawl, review, billing, and runtime-operations workflows for categories such as `keyboard`, `monitor`, `mouse`, and the harness-oriented `tests` category. The pipeline uses a crawl-first architecture centered on `src/features/crawl/` and `src/pipeline/runProduct.js`.

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
- [Data Model](./03-architecture/data-model.md)
- [Auth and Sessions](./03-architecture/auth-and-sessions.md)
- [Routing and GUI](./03-architecture/routing-and-gui.md)

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

### 06. References

- [API Surface](./06-references/api-surface.md)
- [Background Jobs](./06-references/background-jobs.md)
- [Integration Boundaries](./06-references/integration-boundaries.md)

### 07. Patterns

- [Canonical Examples](./07-patterns/canonical-examples.md)
- [Anti-Patterns](./07-patterns/anti-patterns.md)

### Supplemental

- Supplemental files below are preserved as historical records or maintenance ledgers. Use the numbered current-state docs above as the authority set.
- [Spec Factory Knobs Maintenance Log](./05-operations/spec_factory_knobs_maintenance.md)
- [Structural Audit 2026-03-23](./03-architecture/STRUCTURAL-AUDIT-2026-03-23.md)
- [Structural Audit 2026-03-24](./03-architecture/STRUCTURAL-AUDIT-2026-03-24.md)
- [App/API Wiring Test Audit](./test-audit/app-api-wiring-audit.md)

## Excluded Subtree

- `docs/implementation/` exists on disk but is explicitly excluded from this current-state documentation pass and from the LLM reading order. Do not treat it as current-state authority.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | Main HTTP/WebSocket runtime and route composition entrypoint |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route and tab inventory single source of truth |
| source | `tools/gui-react/src/App.tsx` | GUI HashRouter shell and lazy route assembly |
| source | `src/db/specDbSchema.js` | Canonical SQLite table inventory for the data-model docs |
| config | `package.json` | Root scripts, Node engine, and backend dependency declarations |
| config | `tools/gui-react/package.json` | GUI package scripts and frontend dependency declarations |
| source | `src/shared/settingsRegistry.js` | SSOT settings registry verified for environment-and-config and knobs docs |
| command | `npm run env:check` | currently fails because `.env.example` is missing `PORT`; the checker also remains a narrow fixed-list scan |
| command | `npm run gui:build` | succeeded on 2026-03-25 and wrote the current `tools/gui-react/dist/` bundle |
| command | `npm test` | full suite passed on the audited worktree (`5827` passing tests) |

## Related Documents

- [Scope](./01-project-overview/scope.md) - Defines what this repo is and what it explicitly is not.
- [System Map](./03-architecture/system-map.md) - Fastest architecture-level view after this entrypoint.
- [Spec Factory Knobs Maintenance](./05-operations/spec_factory_knobs_maintenance.md) - Setting/knob retirement and maintenance log.
- [Documentation Audit Ledger](./05-operations/documentation-audit-ledger.md) - Phase-0 disposition record for this documentation refresh.
