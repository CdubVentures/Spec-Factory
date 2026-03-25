# Scope

> **Purpose:** Define the live system boundary, intended operators, and explicit non-goals so an arriving LLM does not invent missing systems.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-03-25

Spec Factory is a local-first spec indexing, review, and runtime-operations workbench. The live repo contains a Node.js server in `src/api/guiServer.js`, a React/Vite operator GUI in `tools/gui-react/`, a SQLite persistence layer in `src/db/`, authored category and user-settings content under `category_authority/`, and a CLI/orchestration surface in `src/cli/spec.js` for indexing, queue, review, reporting, drift, migration, and daemon tasks.

## What This Project Is

- A single-repo operator tool for product-spec discovery, indexing, review, and curation.
- A local HTTP/WebSocket runtime that serves a GUI and exposes `/api/v1/*` plus `/ws`.
- A crawl-first pipeline (`src/features/crawl/`, `src/pipeline/runProduct.js`) that runs discovery, browser-based crawling with plugin automation, and review workflows against category/product data. The former extraction-heavy monolith (consensus, learning gates, evidence audit) has been replaced by a lean crawl-and-record architecture.
- A desktop/local-workstation oriented toolchain with launcher scripts, `.bat` wrappers, and optional packaged executables.

## What This Project Is Not

- Not a public website or static-content site. No Astro, Next.js, Remix, or MDX app was found.
- Not a multi-user SaaS with account management, org tenancy, or role-driven auth middleware.
- Not a deployed cloud-native service with checked-in CI/CD workflows, Kubernetes manifests, or Terraform.
- Not a repo where `docs/implementation/` is authoritative current-state documentation. That subtree exists on disk but is excluded from this documentation pass.

## Explicit Exclusions

- No verified login/logout UI or end-user authentication flow.
- No verified request-auth middleware, session issuance flow, or user-role matrix in the live server or emitted config manifest.
- No checked-in remote git workflow, branch naming standard, PR template, or GitHub Actions workflow.
- No verified production deployment topology beyond local server startup and packaging scripts.

## Target Operators

| Operator | Live entrypoints | Primary responsibilities |
|----------|------------------|--------------------------|
| Indexing operator | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `src/cli/spec.js` | start runs, inspect artifacts, tune runtime settings |
| Review curator | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` | accept/reject candidates, component review, enum review |
| Rule author | `tools/gui-react/src/features/studio/components/StudioPage.tsx` | author field rules, mappings, tooltips, component DB state |
| Runtime maintainer | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`, `src/app/api/processRuntime.js` | monitor workers, process state, SearXNG, storage, queue |

## Current Status

- Status: active local/internal development workbench.
- Evidence:
  - `npm run gui:build` succeeded on 2026-03-25 and produced the current `tools/gui-react/dist/` bundle.
  - `npm run env:check` currently fails because `.env.example` is missing `PORT`.
  - `npm test` passed on the audited worktree with `5827` passing tests.
  - `http://127.0.0.1:8788/api/v1/categories` returns `["keyboard","monitor","mouse","tests"]` for the live category inventory.
  - `Dockerfile` references `src/cli/run-batch.js`, which does not exist in the live repo.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | Local HTTP/WebSocket runtime and GUI-serving behavior |
| source | `src/cli/spec.js` | CLI commands and operator-facing workflow scope |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route inventory and operator-facing page scope |
| source | `tools/gui-react/src/App.tsx` | top-level client shell and `test-mode` exception route |
| config | `package.json` | Scripts and local-run surfaces |
| config | `Dockerfile` | Confirms checked-in deployment artifact divergence |
| command | `npm run gui:build` | current GUI build baseline is green and produces the served `tools/gui-react/dist/` assets |
| command | `npm run env:check` | current env-sync script baseline is failing because `.env.example` does not define `PORT` |
| command | `npm test` | current suite baseline is green on the audited worktree (`5827` passing tests) |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | Live category inventory available from the running server |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where each runtime boundary lives on disk.
- [Conventions](./conventions.md) - Lists the repo rules an LLM must follow before editing.
- [Known Issues](../05-operations/known-issues.md) - Captures the current env-sync drift, stale client route, and stale deployment artifacts.
