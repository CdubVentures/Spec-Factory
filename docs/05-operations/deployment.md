# Deployment

> **Purpose:** Document the verified build, packaging, startup, and promotion surfaces for the live local-first runtime.
> **Prerequisites:** [../02-dependencies/setup-and-installation.md](../02-dependencies/setup-and-installation.md), [../03-architecture/system-map.md](../03-architecture/system-map.md)
> **Last validated:** 2026-04-07

## Deployment Model

| Runtime shape | Entry point | What it does | Current status |
|---------------|-------------|--------------|----------------|
| Local GUI API server | `src/app/api/guiServer.js` | serves `tools/gui-react/dist`, exposes `/api/v1/*`, opens WebSocket `/ws` | primary live runtime |
| Local dev GUI | `tools/gui-react/vite.config.ts` + `npm run gui:dev` | hot-reload frontend during development | supported |
| Packaged desktop app | `tools/build-exe.mjs` -> generated `SpecFactory.exe` + `gui-dist/` | bundles launcher and copies built GUI assets for distribution | supported; generated artifact not present in current checkout |
| Setup launcher | `tools/specfactory-launcher.mjs` or generated `Launcher.exe` | local dependency/bootstrap console on default port `8799` | supported; generated artifact not present in current checkout |
| Optional local search sidecar | `tools/searxng/docker-compose.yml` | local SearXNG instance used by search workflows | optional |
| Docker batch image | `Dockerfile` | batch CLI image that runs `node src/app/cli/spec.js indexlab --category mouse` | present but not executed during this audit; not the primary GUI deployment path |

## Available Commands

| Goal | Command | Source |
|------|---------|--------|
| Build GUI only | `npm run gui:build` | `package.json` |
| Start API against built GUI | `npm run gui:api` | `package.json` |
| Build GUI then start API | `npm run gui:start` | `package.json` |
| Open setup launcher UI | `npm run setup:gui` | `package.json` |
| Build packaged desktop runtime | `npm run gui:exe` | `package.json`, `tools/build-exe.mjs` |
| Build packaged setup launcher | `npm run setup:exe` | `package.json`, `tools/build-setup-exe.mjs` |
| Start IndexLab CLI directly | `npm run run:indexlab` | `package.json`, `src/app/cli/spec.js` |
| Start IndexLab batch (Docker) | `node src/app/cli/spec.js indexlab --category <category>` | `Dockerfile`, `src/app/cli/spec.js` |

Current audit note: `npm run gui:build` is present in `package.json` and succeeded on 2026-04-04, producing the currently served `tools/gui-react/dist/` bundle. Re-validated 2026-04-07.

## Build And Packaging Flow

1. `npm run gui:build` runs the Vite build in `tools/gui-react/` and writes `tools/gui-react/dist/`.
2. `npm run gui:api` runs `node src/app/api/guiServer.js --port 8788 --local` and serves the built assets.
3. `npm run gui:exe` executes `tools/build-exe.mjs`, which:
   - ensures frontend dependencies exist,
   - rebuilds the GUI,
   - bundles `tools/gui-launcher.mjs` into `tools/dist/launcher.cjs`,
   - compiles a repo-root `SpecFactory.exe` with `@yao-pkg/pkg`,
   - copies GUI assets to `gui-dist/`.
4. `npm run setup:exe` executes `tools/build-setup-exe.mjs` and produces a repo-root `Launcher.exe`.
5. `Dockerfile` defines a Playwright-based batch image that copies the repo, installs Node and Python dependencies, and starts `indexlab --category mouse`; it does not package or serve the GUI runtime.

## Promotion And Environments

| Environment | Verified path | Notes |
|-------------|---------------|-------|
| Local development | source checkout + `npm run gui:dev` / `npm run gui:api` | primary authoring mode |
| Local operator runtime | built GUI + `npm run gui:start` | closest to production-like local run |
| Distributed desktop build | generated `SpecFactory.exe` + `gui-dist/` | manual distribution artifact |
| Local batch container | `Dockerfile` | CLI-oriented container definition only; not run during this audit |
| CI/CD | none verified | no `.github/workflows`, cloud deploy scripts, or hosted environment manifests were found |

## Rollback Reality

- No scripted rollback pipeline was verified.
- Practical rollback is manual:
  - for local source runs, restart the previous working tree state handled by the human;
  - for packaged desktop delivery, replace the generated `SpecFactory.exe` and `gui-dist/` with a previously known-good build.
- `tools/build-exe.mjs` explicitly stops a running `SpecFactory.exe` before overwriting the executable, which is part of the local replacement workflow rather than a versioned release system.

## Non-Verified Or Supplemental Surfaces

- The Docker batch image was not built or run during this audit.
- No remote deployment manifests, Helm charts, Terraform, or container orchestration configs were verified.
- The generated `SpecFactory.exe` and `Launcher.exe` artifacts were not present in the current checkout; only the build scripts and wrappers were verified.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | build/start/package scripts |
| source | `src/app/api/guiServer.js` | main runtime boot path |
| source | `src/app/cli/spec.js` | CLI entrypoints including `indexlab` |
| source | `tools/build-exe.mjs` | packaged desktop build pipeline |
| source | `tools/build-setup-exe.mjs` | packaged launcher build pipeline |
| source | `tools/specfactory-launcher.mjs` | launcher runtime and default port |
| config | `Dockerfile` | batch CLI container definition and `indexlab` entrypoint |
| command | `npm run gui:build` | current GUI build pipeline is green and writes `tools/gui-react/dist/` |
| runtime | `http://127.0.0.1:8788/health` | live server responded during the audit |

## Related Documents

- [Setup and Installation](../02-dependencies/setup-and-installation.md) - Local prerequisite and startup commands.
- [Monitoring and Logging](./monitoring-and-logging.md) - Health/status surfaces available after deployment.
- [Known Issues](./known-issues.md) - Tracks the local-trust and env-check operational gotchas.
