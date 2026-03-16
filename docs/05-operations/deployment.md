# Deployment

> **Purpose:** Document the verified build, packaging, startup, and promotion surfaces for the live local-first runtime.
> **Prerequisites:** [../02-dependencies/setup-and-installation.md](../02-dependencies/setup-and-installation.md), [../03-architecture/system-map.md](../03-architecture/system-map.md)
> **Last validated:** 2026-03-15

## Deployment Model

| Runtime shape | Entry point | What it does | Current status |
|---------------|-------------|--------------|----------------|
| Local GUI API server | `src/api/guiServer.js` | serves `tools/gui-react/dist`, exposes `/api/v1/*`, opens WebSocket `/ws` | primary live runtime |
| Local dev GUI | `tools/gui-react/vite.config.ts` + `npm run gui:dev` | hot-reload frontend during development | supported |
| Packaged desktop app | `tools/build-exe.mjs` -> `SpecFactory.exe` + `gui-dist/` | bundles launcher and copies built GUI assets for distribution | supported |
| Setup launcher | `tools/specfactory-launcher.mjs` or `Launcher.exe` | local dependency/bootstrap console on default port `8799` | supported |
| Optional local search sidecar | `tools/searxng/docker-compose.yml` | local SearXNG instance used by search workflows | optional |
| Docker container | `Dockerfile` | container image attempt for batch CLI | stale; not the verified deployment path |

## Verified Commands

| Goal | Command | Source |
|------|---------|--------|
| Build GUI only | `npm run gui:build` | `package.json` |
| Start API against built GUI | `npm run gui:api` | `package.json` |
| Build GUI then start API | `npm run gui:start` | `package.json` |
| Open setup launcher UI | `npm run setup:gui` | `package.json` |
| Build packaged desktop runtime | `npm run gui:exe` | `package.json`, `tools/build-exe.mjs` |
| Build packaged setup launcher | `npm run setup:exe` | `package.json`, `tools/build-setup-exe.mjs` |
| Start IndexLab CLI directly | `npm run run:indexlab` | `package.json`, `src/cli/spec.js` |
| Start local GraphQL helper API | `npm run intel:api` | `package.json`, `src/cli/spec.js`, `src/api/intelGraphApi.js` |

## Build And Packaging Flow

1. `npm run gui:build` runs the Vite build in `tools/gui-react/` and writes `tools/gui-react/dist/`.
2. `npm run gui:api` runs `node src/api/guiServer.js --port 8788 --local` and serves the built assets.
3. `npm run gui:exe` executes `tools/build-exe.mjs`, which:
   - ensures frontend dependencies exist,
   - rebuilds the GUI,
   - bundles `tools/gui-launcher.mjs` into `tools/dist/launcher.cjs`,
   - compiles `SpecFactory.exe` with `@yao-pkg/pkg`,
   - copies GUI assets to `gui-dist/`.
4. `npm run setup:exe` executes `tools/build-setup-exe.mjs` and produces `Launcher.exe`.

## Promotion And Environments

| Environment | Verified path | Notes |
|-------------|---------------|-------|
| Local development | source checkout + `npm run gui:dev` / `npm run gui:api` | primary authoring mode |
| Local operator runtime | built GUI + `npm run gui:start` | closest to production-like local run |
| Distributed desktop build | `SpecFactory.exe` + `gui-dist/` | manual distribution artifact |
| CI/CD | none verified | no `.github/workflows`, cloud deploy scripts, or hosted environment manifests were found |

## Rollback Reality

- No scripted rollback pipeline was verified.
- Practical rollback is manual:
  - for local source runs, restart the previous working tree state handled by the human;
  - for packaged desktop delivery, replace `SpecFactory.exe` and `gui-dist/` with a previously known-good build.
- `tools/build-exe.mjs` explicitly stops a running `SpecFactory.exe` before overwriting the executable, which is part of the local replacement workflow rather than a versioned release system.

## Non-Verified Or Stale Surfaces

- `Dockerfile` is not aligned with the live CLI entrypoints. It still launches `node src/cli/run-batch.js`, but that file does not exist; the supported batch entrypoint is `node src/cli/spec.js run-batch`.
- No remote deployment manifests, Helm charts, Terraform, or container orchestration configs were verified.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | build/start/package scripts |
| source | `src/api/guiServer.js` | main runtime boot path |
| source | `src/cli/spec.js` | CLI entrypoints and supported commands |
| source | `tools/build-exe.mjs` | packaged desktop build pipeline |
| source | `tools/build-setup-exe.mjs` | packaged launcher build pipeline |
| source | `tools/specfactory-launcher.mjs` | launcher runtime and default port |
| config | `Dockerfile` | stale container path and missing entrypoint mismatch |

## Related Documents

- [Setup and Installation](../02-dependencies/setup-and-installation.md) - Local prerequisite and startup commands.
- [Monitoring and Logging](./monitoring-and-logging.md) - Health/status surfaces available after deployment.
- [Known Issues](./known-issues.md) - Tracks the stale Docker deployment artifact and other operational gotchas.
