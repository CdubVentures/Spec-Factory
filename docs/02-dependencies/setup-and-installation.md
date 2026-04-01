# Setup and Installation

> **Purpose:** Document the exact local setup path from install to verified GUI runtime using only repo-backed commands and files.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-31

## Prerequisites

- Node.js `>=20` required by `package.json`; audit used `v24.13.1`.
- npm available; audit used `11.8.0`.
- Windows launcher scripts exist, but the runtime itself is Node-based and can be started from the shell directly.
- Optional:
  - Docker for the local SearXNG stack under `tools/searxng/docker-compose.yml`

## Local Setup

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

3. Create or update your local `.env`.

   ```powershell
   Copy-Item .env.example .env
   ```

4. Optionally run the env-template drift check.

   ```powershell
   npm run env:check
   ```

   Current observed behavior on 2026-03-31: this command fails with `Missing keys in config manifest: PORT`. Treat it as a narrow helper, not a complete manifest audit.

5. Build the GUI.

   ```powershell
   npm run gui:build
   ```

   Current observed behavior on 2026-03-31: this command succeeds and writes the served assets to `tools/gui-react/dist/`.

6. Start the GUI API server.

   ```powershell
   npm run gui:api
   ```

   If port `8788` is already occupied, run the server manually on another port:

   ```powershell
   node src/api/guiServer.js --port 8790 --local
   ```

7. Optional helper launcher.

   ```powershell
   node tools/specfactory-launcher.mjs
   ```

## Verification

1. Confirm the build output exists:

   ```text
   tools/gui-react/dist/index.html
   ```

2. Open the local GUI server:

   ```text
   http://localhost:8788/#/
   ```

3. Verify the health surface:

   ```powershell
   Invoke-WebRequest http://localhost:8788/api/v1/health
   ```

4. Verify the live category inventory:

   ```powershell
   Invoke-WebRequest http://localhost:8788/api/v1/categories
   ```

5. Optional test verification:

   ```powershell
   npm test
   ```

   Observed on 2026-03-31: `npm test` passed.

## Useful Local Commands

| Command | Effect |
|---------|--------|
| `npm run gui:build` | build the GUI package |
| `npm run gui:api` | start the Node GUI/API runtime on port `8788` |
| `npm run gui:start` | build GUI then start API server |
| `npm test` | run the Node built-in test suite |
| `node src/cli/spec.js --help` | show CLI usage surface |
| `node tools/specfactory-launcher.mjs` | launch the setup/bootstrap helper |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | install/build/run/test commands |
| config | `tools/gui-react/package.json` | GUI build commands |
| config | `.env.example` | local env bootstrap starting point |
| source | `src/api/guiServer.js` | default GUI/API server runtime |
| source | `tools/specfactory-launcher.mjs` | launcher-based setup path |
| command | `npm run env:check` | failing March 31 env-check result |
| command | `npm run gui:build` | successful March 31 GUI build result |
| command | `npm test` | successful March 31 suite result |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live server health endpoint responded |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory returned `keyboard`, `monitor`, and `mouse` |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Required before adding or changing config keys.
- [Deployment](../05-operations/deployment.md) - Documents the checked-in launch/build/deployment surfaces.
- [Known Issues](../05-operations/known-issues.md) - Captures the current operational gotchas.
