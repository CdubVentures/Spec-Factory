# Spec Factory - CLAUDE.md

> **Purpose:** Provide a compact, high-signal repo truth file for LLM agents arriving with zero prior context.
> **Prerequisites:** `AGENTS.md`, `docs/README.md`
> **Last validated:** 2026-04-04

## Read Order

1. `docs/README.md`
2. `docs/01-project-overview/scope.md`
3. `docs/01-project-overview/folder-map.md`
4. `docs/01-project-overview/conventions.md`
5. `docs/02-dependencies/stack-and-toolchain.md`
6. `docs/02-dependencies/environment-and-config.md`
7. `docs/02-dependencies/external-services.md`
8. `docs/03-architecture/system-map.md`
9. `docs/03-architecture/backend-architecture.md`
10. `docs/03-architecture/frontend-architecture.md`
11. `docs/03-architecture/data-model.md`
12. `docs/03-architecture/auth-and-sessions.md`
13. `docs/04-features/feature-index.md`
14. the relevant file(s) under `docs/04-features/`
15. `docs/07-patterns/canonical-examples.md`
16. `docs/07-patterns/anti-patterns.md`
17. `docs/05-operations/known-issues.md`

## Reality Snapshot

- Local-first GUI/API server:
  - `src/app/api/guiServer.js`
  - `src/app/api/guiServerRuntime.js`
- React/Vite/TypeScript GUI:
  - `tools/gui-react/src/App.tsx`
  - `tools/gui-react/src/registries/pageRegistry.ts`
- CLI:
  - `src/app/cli/spec.js`
  - `src/app/cli/commands/*.js`
- Persistence:
  - `.tmp/` (repo-local scratch root for throwaway test/tool artifacts)
  - `.workspace/db/app.sqlite`
  - `.workspace/db/<category>/spec.sqlite`
  - `category_authority/`
  - `.workspace/runs/`, `.workspace/output/`, `.workspace/products/`

## Do Not Assume

- No login, JWT, session middleware, or RBAC layer was verified.
- No hosted SaaS, CI/CD pipeline, or infrastructure-as-code stack was verified.
- No checked-in `.env.example` exists in the current tree. The observed local file is `.env`.
- `/api/v1/storage/*` is live, but it is delegated inside `src/features/indexing/api/indexlabRoutes.js`; it is not its own top-level registrar in `src/app/api/guiServerRuntime.js`.
- `src/app/api/routeRegistry.js` is a registry builder. The live mounted order is `routeDefinitions` in `src/app/api/guiServerRuntime.js`.
- `docs/implementation/` and `docs/data-structure/` exist on disk but are supporting/historical artifacts, not first-pass current-state authority.

## Runtime Entrypoints

| Concern | Path | Notes |
|---------|------|-------|
| GUI/API entrypoint | `src/app/api/guiServer.js` | starts the assembled runtime and serves `tools/gui-react/dist/` |
| Runtime assembly SSOT | `src/app/api/guiServerRuntime.js` | bootstraps config, storage, DB, realtime, process runtime, and route contexts |
| HTTP assembly | `src/app/api/guiServerHttpAssembly.js` | turns `routeDefinitions` into the request handler |
| Request parsing and dispatch | `src/app/api/requestDispatch.js` | owns `/api/v1/*` parsing and dispatch |
| CLI entrypoint | `src/app/cli/spec.js` | indexing, review, compile, discover, reporting, and helper commands |
| GUI route registry | `tools/gui-react/src/registries/pageRegistry.ts` | routed page and tab SSOT |
| Standalone GUI route | `tools/gui-react/src/pages/test-mode/TestModePage.tsx` | mounted outside `PAGE_REGISTRY` |

## SSOT Files

| Topic | Path | Why it matters |
|------|------|----------------|
| Mounted backend route order | `src/app/api/guiServerRuntime.js` | `routeDefinitions` is the live mounted order |
| Tabbed GUI route inventory | `tools/gui-react/src/registries/pageRegistry.ts` | path, label, loader, and tab-group source of truth |
| Runtime settings registry | `src/shared/settingsRegistry.js` | canonical key inventory: `136` runtime, `3` bootstrap, `4` UI |
| Env manifest | `src/core/config/manifest/index.js` | emitted manifest sections and defaults |
| Runtime roots | `src/core/config/runtimeArtifactRoots.js` | `.workspace` roots and snapshots |
| Global DB schema | `src/db/appDbSchema.js` | settings, brands, colors, and shared state |
| Per-category DB schema | `src/db/specDbSchema.js` | products, runs, review state, route matrices, artifacts |
| Storage inventory API | `src/features/indexing/api/indexlabRoutes.js`, `src/features/indexing/api/storageManagerRoutes.js` | live `/api/v1/storage/*` contract |
| LLM routing boundary | `src/core/llm/client/routing.js`, `src/core/llm/providers/index.js` | provider selection and transport dispatch |

## Validation Snapshot

- `npm run env:check` failed on 2026-04-04 with `Missing keys in config manifest: PORT`.
- `npm run gui:build` passed on 2026-04-04.
- `npm test` passed on 2026-04-04 with `6803` tests and `0` failures.
- Runtime smoke on 2026-04-04 confirmed:
  - `GET /health` -> `200`, `service: "gui-server"`
  - `GET /api/v1/categories` -> `["keyboard","monitor","mouse"]`
  - `GET /api/v1/process/status` -> `200`, `running: false`
  - `GET /api/v1/storage/overview` -> `200`, `storage_backend: "local"`, `total_runs: 15`

## Known Drift

- `tools/check-env-example-sync.mjs` is named like an `.env.example` sync checker, but it scans a fixed source-file list against `CONFIG_MANIFEST_KEYS`.
- `tools/gui-react/src/features/review/components/ReviewPage.tsx` still references `POST /api/v1/review/:category/finalize`, but no audited backend handler serves that route.
- Starting the GUI runtime currently logs `field_studio_map re-seed failed: NOT NULL constraint failed: list_values.list_id` for multiple categories during auto-seed.
- `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` remain unauthenticated and can expose secret-bearing fields when configured.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-wide operating rules for all agents |
| source | `src/app/api/guiServer.js` | live server entrypoint |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly and mounted route order |
| source | `src/app/api/guiServerHttpAssembly.js` | HTTP assembly role |
| source | `src/app/cli/spec.js` | CLI surface |
| source | `tools/gui-react/src/App.tsx` | GUI SPA shell |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | routed page inventory |
| source | `src/shared/settingsRegistry.js` | config/settings SSOT counts |
| source | `src/core/config/manifest/index.js` | manifest sections |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage backend reporting |
| command | `npm run gui:build` | GUI build result on 2026-04-04 |
| command | `npm test` | full-suite result on 2026-04-04 |
| command | `npm run env:check` | current env-check failure on 2026-04-04 |
| runtime | `GET /health` | live server smoke result on 2026-04-04 |
| runtime | `GET /api/v1/storage/overview` | live storage smoke result on 2026-04-04 |

## Related Documents

- [docs/README.md](docs/README.md) - maintained reading order and full docs index.
- [docs/06-references/api-surface.md](docs/06-references/api-surface.md) - endpoint inventory for the runtime summarized here.
- [docs/05-operations/known-issues.md](docs/05-operations/known-issues.md) - current runtime drift and operational hazards.
- [docs/05-operations/documentation-audit-ledger.md](docs/05-operations/documentation-audit-ledger.md) - file-level audit and disposition record.
