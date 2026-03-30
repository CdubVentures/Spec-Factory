# Scope

> **Purpose:** Define the live system boundary, intended operators, and explicit non-goals so an arriving LLM does not invent missing systems.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-03-30

Spec Factory is a local-first indexing and review workbench for product-spec discovery, crawl execution, review curation, category-authority maintenance, and runtime diagnostics. The live repo contains a Node.js HTTP/WebSocket server in `src/api/guiServer.js` and `src/api/guiServerRuntime.js`, a React/Vite operator GUI in `tools/gui-react/`, a global `app.sqlite` plus per-category `spec.sqlite` persistence layer in `src/db/`, authored control-plane content under `category_authority/`, and a CLI/orchestration surface in `src/cli/spec.js`.

## What This Project Is

- A single-repo operator tool for category management, crawl-first indexing, review, studio authoring, runtime telemetry, and maintenance workflows.
- A local HTTP plus WebSocket runtime that serves a built GUI and exposes `/api/v1/*` plus `/ws`.
- A crawl-first pipeline centered on `src/features/crawl/`, `src/features/indexing/`, and `src/pipeline/runProduct.js`.
- A local workstation toolchain with Node launch commands, packaged-desktop build scripts, and optional local helper sidecars such as SearXNG and the GraphQL helper API.

## What This Project Is Not

- Not a public website, hosted SaaS, or server-rendered web product. No Next.js, Remix, Astro, or hosted edge runtime was verified.
- Not a multi-user system with accounts, login flows, org tenancy, or operator-role authorization.
- Not a cloud-first deployment repo with checked-in CI/CD workflows, Kubernetes manifests, Terraform, or hosted environment inventories.
- Not a repo where `docs/implementation/` is current-state authority for this documentation pass.

## Explicit Exclusions

- No verified login/logout UI, JWT/session issuance flow, or request-auth middleware in the live GUI server.
- No live `/api/v1/convergence-settings` or `/api/v1/storage-settings` surface in the current source tree.
- No verified remote Git workflow, branch naming convention, PR template, or GitHub Actions workflow checked into the repo.
- No verified production deployment topology beyond local startup, packaging scripts, and optional local sidecars.

## Target Operators

| Operator | Live entrypoints | Primary responsibilities |
|----------|------------------|--------------------------|
| Indexing operator | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `src/cli/spec.js` | launch runs, inspect run artifacts, tune runtime settings |
| Review curator | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` | resolve scalar, component, and enum review queues |
| Rule author | `tools/gui-react/src/features/studio/components/StudioPage.tsx` | maintain field rules, maps, tooltips, and component DB projections |
| Runtime maintainer | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`, `src/app/api/processRuntime.js` | inspect workers, process status, queue state, SearXNG status, and storage inventory |

## Current Status

- Status: active internal/local development workbench.
- Evidence collected on 2026-03-30:
  - `npm run gui:build` succeeded and produced the current `tools/gui-react/dist/` bundle.
  - `npm run env:check` failed with `Missing keys in config manifest: PORT`.
  - `npm test` failed; current failing areas include search-plan payload parsing and multiple GUI contract suites under `tools/gui-react/src/features/runtime-ops/`, `tools/gui-react/src/features/review/`, and `tools/gui-react/src/pages/layout/`.
  - `GET http://127.0.0.1:8788/api/v1/categories` returned `["keyboard","monitor","mouse"]`.
  - `category_authority/tests/` still exists on disk as a harness directory, but `src/app/api/routes/infra/categoryRoutes.js` filters it out of the default categories API.
  - `Dockerfile` still points at `src/cli/run-batch.js`, which does not exist in the current repo.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | local GUI/API runtime entrypoint |
| source | `src/api/guiServerRuntime.js` | runtime assembly and mounted route families |
| source | `src/cli/spec.js` | CLI workflow surface |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | operator-facing GUI page inventory |
| source | `src/app/api/routes/infra/categoryRoutes.js` | default categories API excludes the `tests` harness directory |
| config | `package.json` | scripts and local run surfaces |
| config | `Dockerfile` | stale batch entrypoint mismatch |
| command | `npm run env:check` | failing March 30 env-parity baseline |
| command | `npm run gui:build` | successful March 30 GUI build baseline |
| command | `npm test` | failing March 30 suite baseline |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where each boundary lives on disk.
- [Conventions](./conventions.md) - Lists repo rules before editing.
- [Known Issues](../05-operations/known-issues.md) - Carries the current validation failures and live operational drift.
