# Setup and Installation

> **Purpose:** Document the verified local setup path from install to a running GUI/API server.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-04-07

## Prerequisites

| Requirement | Version / note | Evidence |
|-------------|----------------|----------|
| Node.js | `>=20` required; audit used `v24.13.1` | `package.json`, `node -v` |
| npm | audit used `11.8.0` | `npm -v` |
| OS tooling | repo contains Windows launchers, but the verified runtime path is plain Node + npm | `SpecFactory.bat`, `package.json` |
| Optional Docker | needed only for local SearXNG flows | `tools/searxng/docker-compose.yml`, `src/app/api/processRuntime.js` |

## Verified Local Setup

1. Install root dependencies.

   ```powershell
   npm install
   ```

2. Install GUI dependencies.

   ```powershell
   Set-Location tools/gui-react
   npm install
   Set-Location ../..
   ```

3. Create or update a local dotenv file if you need provider keys or non-default paths.

   ```text
   .env
   ```

   Notes:
   - `.env` is the observed default file.
   - No checked-in `.env.example` was found in the current repo.
   - The key inventory lives in `src/shared/settingsRegistry.js` and `src/core/config/manifest/index.js`.

4. Optional: run the manifest coverage check.

   ```powershell
   npm run env:check
   ```

   Current observed result on 2026-04-07:

   ```text
   Missing keys in config manifest: PORT
   ```

5. Build the GUI bundle.

   ```powershell
   npm run gui:build
   ```

   Output path:

   ```text
   tools/gui-react/dist/
   ```

6. Start the GUI/API server.

   ```powershell
   npm run gui:api
   ```

   Script target:

   ```text
   node src/app/api/guiServer.js --port 8788 --local
   ```

7. Optional: use the helper launcher instead of starting the server directly.

   ```powershell
   node tools/specfactory-launcher.mjs
   ```

## Verification

1. Confirm the GUI build output exists.

   ```text
   tools/gui-react/dist/index.html
   ```

2. Open the local GUI.

   ```text
   http://localhost:8788/#/
   ```

3. Verify the health endpoint.

   ```powershell
   Invoke-WebRequest http://localhost:8788/health
   ```

4. Verify the default category list.

   ```powershell
   Invoke-WebRequest http://localhost:8788/api/v1/categories
   ```

5. Verify process status and storage inventory if you need broader smoke coverage.

   ```powershell
   Invoke-WebRequest http://localhost:8788/api/v1/process/status
   Invoke-WebRequest http://localhost:8788/api/v1/storage/overview
   ```

6. Run the test suite if you need a validation baseline after setup.

   ```powershell
   npm test
   ```

## Useful Commands

| Command | Effect |
|---------|--------|
| `npm run gui:build` | builds the GUI package in `tools/gui-react/` |
| `npm run gui:api` | starts the Node GUI/API runtime |
| `npm run gui:start` | builds the GUI and then starts the API runtime |
| `npm test` | runs the Node built-in test suite |
| `npm run env:check` | scans for env keys referenced in selected files but missing from the manifest |
| `node src/app/cli/spec.js` | entrypoint for CLI workflows |
| `node tools/specfactory-launcher.mjs` | launches the setup/bootstrap helper |

## Current Validation Snapshot

| Proof | Result |
|------|--------|
| `npm run gui:build` | pass on 2026-04-07 |
| `npm test` | pass on 2026-04-07 with `6803` tests and `0` failures |
| `npm run env:check` | fail on 2026-04-07 with `Missing keys in config manifest: PORT` |
| Runtime smoke | `/health`, `/api/v1/categories`, `/api/v1/process/status`, and `/api/v1/storage/overview` all returned `200` on 2026-04-07 |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | install/build/run/test commands |
| config | `tools/gui-react/package.json` | GUI install/build commands |
| source | `src/app/api/guiServer.js` | server startup path and default port usage |
| source | `src/app/cli/spec.js` | CLI entrypoint |
| source | `tools/specfactory-launcher.mjs` | helper launcher path |
| source | `tools/check-env-example-sync.mjs` | env-check implementation |
| command | `npm run gui:build` | successful build on 2026-04-07 |
| command | `npm test` | successful test-suite run on 2026-04-07 |
| command | `npm run env:check` | current manifest coverage failure on 2026-04-07 |
| runtime | `GET /health` | live server health contract on 2026-04-07 |
| runtime | `GET /api/v1/categories` | category API response on 2026-04-07 |
| runtime | `GET /api/v1/process/status` | process-status response on 2026-04-07 |
| runtime | `GET /api/v1/storage/overview` | storage inventory response on 2026-04-07 |

## Related Documents

- [Environment and Config](./environment-and-config.md) - lists the config keys and persistence surfaces that affect local startup.
- [Stack and Toolchain](./stack-and-toolchain.md) - lists the exact runtime and build dependencies required for setup.
- [Deployment](../05-operations/deployment.md) - documents the checked-in build and packaging flows beyond local startup.
- [Known Issues](../05-operations/known-issues.md) - captures setup and runtime traps discovered during validation.
