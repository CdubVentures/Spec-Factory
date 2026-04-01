# Spec Factory

> **Purpose:** Point repo-root readers to the current-state documentation authority and the live runtime entrypoints.
> **Prerequisites:** [docs/README.md](docs/README.md)
> **Last validated:** 2026-03-31

Spec Factory is a local-first Node.js plus React workbench for crawl-first product-spec indexing, review, category-authority maintenance, and runtime diagnostics. The maintained current-state documentation set lives under [`docs/`](docs/README.md); the old package-style README content previously in this file did not match the live repository.

## Start Here

1. Read [`docs/README.md`](docs/README.md) for the LLM reading order.
2. Use `src/api/guiServer.js` and `src/api/guiServerRuntime.js` for the local GUI/API runtime.
3. Use `src/cli/spec.js` for CLI-driven indexing, review, and helper flows.

## Current Validation Snapshot

- `npm run gui:build` succeeded on 2026-03-31.
- `npm test` succeeded on 2026-03-31.
- `npm run env:check` failed on 2026-03-31 with `Missing keys in config manifest: PORT`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | primary local GUI/API server entrypoint |
| source | `src/api/guiServerRuntime.js` | runtime assembly SSOT |
| source | `src/cli/spec.js` | CLI entrypoint |
| doc | `docs/README.md` | current-state documentation entrypoint |
| config | `package.json` | live scripts and package identity |
| command | `npm run gui:build` | GUI build baseline on 2026-03-31 |
| command | `npm test` | full-suite green baseline on 2026-03-31 |
| command | `npm run env:check` | current env-check failure on 2026-03-31 |

## Related Documents

- [docs/README.md](docs/README.md) - master entrypoint for the maintained documentation hierarchy.
- [docs/01-project-overview/scope.md](docs/01-project-overview/scope.md) - concise live system boundary.
- [docs/03-architecture/system-map.md](docs/03-architecture/system-map.md) - runtime topology and storage/persistence boundaries.
