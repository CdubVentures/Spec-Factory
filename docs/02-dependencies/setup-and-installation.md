# Setup and Installation

> **Purpose:** Document the exact local setup path from install to verified GUI runtime using only repo-backed commands and files.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-15

## Prerequisites

- Node.js `>=20` required by `package.json`; audit used `v22.14.0`.
- npm available; audit used `10.9.2`.
- Windows launcher scripts exist, but the runtime itself is Node-based and can be started from the shell directly.
- Optional:
  - Docker for local SearXNG control via `tools/searxng/docker-compose.yml`
  - Python/sidecar dependencies if using the EloShapes adapter or structured metadata sidecar

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

4. Optionally validate manifest coverage for env references.

   ```powershell
   npm run env:check
   ```

5. Build the GUI.

   ```powershell
   npm run gui:build
   ```

6. Start the GUI API server.

   ```powershell
   npm run gui:api
   ```

7. Optional alternative launchers.

   ```powershell
   node tools/specfactory-launcher.mjs
   ```

## Verification

1. Confirm the GUI build exists:

   ```text
   tools/gui-react/dist/index.html
   ```

2. Open the local GUI server:

   ```text
   http://localhost:8788
   ```

3. Verify the health surface:

   ```powershell
   Invoke-WebRequest http://localhost:8788/api/v1/health
   ```

4. Optional test verification:

   ```powershell
   npm test
   ```

   Audit note: the baseline suite is currently red. The 2026-03-15 audit rerun observed 21 failing tests. See [../05-operations/known-issues.md](../05-operations/known-issues.md).

## Useful Local Commands

| Command | Effect |
|---------|--------|
| `npm run gui:build` | build the GUI package |
| `npm run gui:api` | start the Node GUI/API runtime on port `8788` |
| `npm run gui:start` | build GUI then start API server |
| `npm test` | run the Node built-in test suite |
| `node src/cli/spec.js --help` | show CLI usage surface |
| `node tools/specfactory-launcher.mjs` | launch setup/bootstrap helper |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | install/build/run/test commands |
| config | `tools/gui-react/package.json` | GUI build commands |
| config | `.env.example` | local env bootstrap starting point |
| source | `src/api/guiServer.js` | default GUI/API server runtime |
| source | `tools/specfactory-launcher.mjs` | launcher-based setup path |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Required before adding or changing config keys.
- [Deployment](../05-operations/deployment.md) - Documents the checked-in launch/build/deployment surfaces.
- [Known Issues](../05-operations/known-issues.md) - Captures the current baseline failures and stale Docker artifact.
