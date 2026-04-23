# Spec Factory

> **Purpose:** Point a first-time human or LLM at the maintained current-state documentation and the live runtime entrypoints.
> **Prerequisites:** [CLAUDE.md](./CLAUDE.md), [docs/README.md](./docs/README.md)
> **Last validated:** 2026-04-10

Spec Factory is a local-first operator workbench for product-spec indexing, review, authority authoring, publisher validation, and runtime diagnostics. The live runtime is a Node HTTP + WebSocket server assembled in `src/app/api/guiServerRuntime.js`, launched by `src/app/api/guiServer.js`, serving a React/Vite GUI from `tools/gui-react/dist/`, with SQLite persistence in `.workspace/db/` and authored category control-plane files under `category_authority/`.

## Start Here

1. [CLAUDE.md](./CLAUDE.md)
2. [docs/README.md](./docs/README.md)
3. [docs/01-project-overview/scope.md](./docs/01-project-overview/scope.md)
4. [docs/01-project-overview/folder-map.md](./docs/01-project-overview/folder-map.md)
5. [docs/03-architecture/system-map.md](./docs/03-architecture/system-map.md)
6. [docs/06-references/api-surface.md](./docs/06-references/api-surface.md)

## Optional: Crawl4AI Python sidecar

The extraction pipeline includes an optional Python sidecar (`pipeline-extraction-sidecar/`) that runs `crawl4ai` to turn rendered HTML into clean markdown + spec tables + lists. Install is optional — without Python the sidecar is skipped and screenshots + video + HTML capture continue unchanged.

```
pip install -r pipeline-extraction-sidecar/pipeline_extraction_sidecar/requirements.txt
```

We intentionally skip `playwright install` — crawl4ai receives pre-rendered HTML from the Node Playwright fleet. Install is ~50MB, not 400MB. See `pipeline-extraction-sidecar/pipeline_extraction_sidecar/README.md` for the stdio JSON protocol and fallback behavior.

## Live Entrypoints

| Surface | Path | Notes |
|--------|------|-------|
| GUI/API server | `src/app/api/guiServer.js` | starts the local Node server |
| Runtime assembly | `src/app/api/guiServerRuntime.js` | mounts 17 backend route families and `/ws` |
| CLI | `src/app/cli/spec.js` | command entrypoint for indexing, review, and maintenance flows |
| GUI route registry | `tools/gui-react/src/registries/pageRegistry.ts` | SSOT for 18 tabbed GUI routes |

## Current Validation Snapshot

- `npm run env:check` failed on 2026-04-10 with `Missing keys in config manifest: PORT`.
- `npm run gui:build` passed on 2026-04-10.
- `npm test` failed on 2026-04-10: `7788` tests, `7778` passed, `10` failed.
- Runtime smoke on 2026-04-10 confirmed:
  - `GET /health` -> `200`
  - `GET /api/v1/categories` -> `["keyboard","monitor","mouse"]`
  - `GET /api/v1/process/status` -> `200`, `running: false`, `storage_destination: "local"`
  - `GET /api/v1/storage/overview` -> `200`, `storage_backend: "local"`, `total_runs: 0`

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `CLAUDE.md` | root LLM entrypoint path |
| source | `docs/README.md` | maintained documentation entrypoint |
| source | `src/app/api/guiServer.js` | server entrypoint path |
| source | `src/app/api/guiServerRuntime.js` | runtime assembly, route-family count, and `/ws` attachment |
| source | `src/app/cli/spec.js` | CLI entrypoint |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route registry path and route count |
| command | `npm run env:check` | env-check result on 2026-04-10 |
| command | `npm run gui:build` | GUI build result on 2026-04-10 |
| command | `npm test` | full-suite result on 2026-04-10 |
| runtime | `GET /health` | health response on 2026-04-10 |
| runtime | `GET /api/v1/storage/overview` | storage overview response on 2026-04-10 |

## Related Documents

- [CLAUDE.md](./CLAUDE.md) - compact LLM-first truth file for the repo root.
- [docs/README.md](./docs/README.md) - full table of contents and reading order.
- [docs/05-operations/known-issues.md](./docs/05-operations/known-issues.md) - current runtime and documentation hazards.
- [docs/05-operations/documentation-audit-ledger.md](./docs/05-operations/documentation-audit-ledger.md) - file-by-file doc disposition record for this pass.
