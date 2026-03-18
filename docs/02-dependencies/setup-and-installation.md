# Setup and Installation

> **Purpose:** Document the exact local setup path from install to verified GUI runtime using only repo-backed commands and files.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-17

## Prerequisites

- Node.js `>=20` required by `package.json`; audit used `v24.13.1`.
- npm available; audit used `11.8.0`.
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

   Current observed behavior on 2026-03-17: this command returns `[env-check] OK (3 referenced keys covered)`. That is still a narrow reference scan, not a complete manifest-to-env audit; see [environment-and-config.md](./environment-and-config.md) for the actual authority chain.

5. Build the GUI.

   ```powershell
   npm run gui:build
   ```

6. Start the GUI API server.

   ```powershell
   npm run gui:api
   ```

   If port `8788` is already occupied, run the server manually on another port:

   ```powershell
   node src/api/guiServer.js --port 8790 --local
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

   Observed on 2026-03-17: `npm test` reported `6313` pass, `11` fail, `1` skipped. See [../05-operations/known-issues.md](../05-operations/known-issues.md) for the active failing clusters.

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
| command | `npm run env:check` | env-check passes on the current audit baseline |
| command | `npm run gui:build` | GUI build succeeded during the audit |
| command | `npm test` | full test suite currently reports 11 failures |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live server health endpoint responded with `ok: true` |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Required before adding or changing config keys.
- [Deployment](../05-operations/deployment.md) - Documents the checked-in launch/build/deployment surfaces.
- [Known Issues](../05-operations/known-issues.md) - Captures the current baseline failures and stale Docker artifact.
