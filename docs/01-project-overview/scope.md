# Scope

> **Purpose:** Define the live system boundary, intended operators, and explicit non-goals so an arriving LLM does not invent missing systems.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-03-23

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
- No verified JWT-backed session middleware despite `JWT_SECRET` and `JWT_EXPIRES_IN` existing in the config manifest.
- No checked-in remote git workflow, branch naming standard, PR template, or GitHub Actions workflow.
- No verified production deployment topology beyond local server startup, GUI build, and packaging scripts.

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
  - `npm run gui:build` succeeds.
  - `npm run env:check` returns `[env-check] OK (3 referenced keys covered)`.
  - `npm test` reported `6555` pass, `77` fail on 2026-03-23 (6632 total; reduced from ~7693 after pipeline rework deleted ~130 test files). The failing clusters are tracked in [../05-operations/known-issues.md](../05-operations/known-issues.md).
  - `http://127.0.0.1:8788/api/v1/categories` returns `["gaming_mice","keyboard","monitor","mouse"]` for the live category inventory.
  - `Dockerfile` references `src/cli/run-batch.js`, which does not exist in the live repo.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | Local HTTP/WebSocket runtime and GUI-serving behavior |
| source | `src/cli/spec.js` | CLI commands and operator-facing workflow scope |
| source | `tools/gui-react/src/App.tsx` | GUI route inventory and operator surfaces |
| config | `package.json` | Scripts and local-run surfaces |
| config | `Dockerfile` | Confirms checked-in deployment artifact divergence |
| command | `npm run gui:build` | GUI build passes on the current audit baseline |
| command | `npm run env:check` | env-sync script currently reports `OK (3 referenced keys covered)` |
| command | `npm test` | current suite baseline is red with 77 failures (6555 pass, 6632 total) |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | Live category inventory available from the running server |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where each runtime boundary lives on disk.
- [Conventions](./conventions.md) - Lists the repo rules an LLM must follow before editing.
- [Known Issues](../05-operations/known-issues.md) - Captures the current env-sync drift, stale client route, and stale deployment artifacts.
