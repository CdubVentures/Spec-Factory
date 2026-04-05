# Spec Factory

> **Purpose:** Point humans and agents at the maintained documentation entrypoints and the live runtime roots.
> **Prerequisites:** `CLAUDE.md`, `docs/README.md`
> **Last validated:** 2026-04-04

Spec Factory is a local-first product-spec indexing and review workbench. The live runtime is a Node.js GUI/API server in `src/app/api/guiServer.js` plus `src/app/api/guiServerRuntime.js`, a React/Vite GUI in `tools/gui-react/`, a CLI surface in `src/app/cli/spec.js`, SQLite persistence in `.workspace/db/`, and authored category control-plane files in `category_authority/`.

## Start Here

1. `CLAUDE.md`
2. `docs/README.md`
3. `docs/01-project-overview/scope.md`
4. `docs/03-architecture/system-map.md`
5. `docs/06-references/api-surface.md`

## Live Entrypoints

| Surface | Path |
|--------|------|
| GUI/API server | `src/app/api/guiServer.js` |
| Runtime assembly | `src/app/api/guiServerRuntime.js` |
| CLI | `src/app/cli/spec.js` |
| GUI route registry | `tools/gui-react/src/registries/pageRegistry.ts` |

## Current Validation Snapshot

- `npm run env:check` failed on 2026-04-04 with `Missing keys in config manifest: PORT`.
- `npm run gui:build` passed on 2026-04-04.
- `npm test` passed on 2026-04-04 with `6803` tests and `0` failures.
- Runtime smoke on 2026-04-04 confirmed:
  - `GET /health`
  - `GET /api/v1/categories`
  - `GET /api/v1/process/status`
  - `GET /api/v1/storage/overview`

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `CLAUDE.md` | primary LLM entrypoint |
| source | `docs/README.md` | maintained docs index and reading order |
| source | `src/app/api/guiServer.js` | server entrypoint path |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly path |
| source | `src/app/cli/spec.js` | CLI entrypoint |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route registry path |
| command | `npm run env:check` | env-check result on 2026-04-04 |
| command | `npm run gui:build` | GUI build result on 2026-04-04 |
| command | `npm test` | full-suite result on 2026-04-04 |

## Related Documents

- [CLAUDE.md](./CLAUDE.md) - compact repo truth file for LLM agents.
- [docs/README.md](./docs/README.md) - full documentation table of contents and reading order.
- [docs/05-operations/known-issues.md](./docs/05-operations/known-issues.md) - active drift and hazards.
- [docs/05-operations/documentation-audit-ledger.md](./docs/05-operations/documentation-audit-ledger.md) - file-by-file doc audit record.
