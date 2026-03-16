# Scope

> **Purpose:** Define the live system boundary, intended operators, and explicit non-goals so an arriving LLM does not invent missing systems.
> **Prerequisites:** [../README.md](../README.md)
> **Last validated:** 2026-03-15

Spec Factory is a local-first spec indexing, review, and runtime-operations workbench. The live repo contains a Node.js server in `src/api/guiServer.js`, a React/Vite operator GUI in `tools/gui-react/`, a SQLite persistence layer in `src/db/`, authored category/rule content under `category_authority/`, and a CLI/orchestration surface in `src/cli/spec.js` for indexing, queue, review, reporting, and migration tasks.

## What This Project Is

- A single-repo operator tool for product-spec discovery, indexing, review, and curation.
- A local HTTP/WebSocket runtime that serves a GUI and exposes `/api/v1/*` plus `/ws`.
- A pipeline that can run discovery, retrieval, extraction, review, billing, and learning workflows against category/product data.
- A desktop/local-workstation oriented toolchain with launcher scripts, `.bat` wrappers, and optional packaged executables.

## What This Project Is Not

- Not a public website or static-content site. No Astro, Next.js, Remix, or MDX app was found.
- Not a multi-user SaaS with account management, org tenancy, or role-driven auth middleware.
- Not a deployed cloud-native service with checked-in CI/CD workflows, Kubernetes manifests, or Terraform.
- Not a repo where `docs/implementation/` is authoritative current-state documentation.

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
  - `npm run gui:build` succeeded during audit on 2026-03-15.
  - `npm test` baseline is not green; the 2026-03-15 audit rerun observed 21 failing tests spanning GUI waits, missing GUI modules, field-rules compiler contracts, type generation, and IndexLab integration coverage.
  - `Dockerfile` references `src/cli/run-batch.js`, which does not exist in the live repo.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | Local HTTP/WebSocket runtime and GUI-serving behavior |
| source | `src/cli/spec.js` | CLI commands and operator-facing workflow scope |
| source | `tools/gui-react/src/App.tsx` | GUI route inventory and operator surfaces |
| config | `package.json` | Scripts and local-run surfaces |
| config | `Dockerfile` | Confirms checked-in deployment artifact divergence |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where each runtime boundary lives on disk.
- [Conventions](./conventions.md) - Lists the repo rules an LLM must follow before editing.
- [Known Issues](../05-operations/known-issues.md) - Captures the current baseline failures and stale deployment artifacts.
