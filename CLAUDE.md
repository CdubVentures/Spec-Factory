# Spec Factory Root Truth

> **Purpose:** Give an arriving LLM the minimum current-state repo truth needed before reading the full docs tree.
> **Prerequisites:** [docs/README.md](./docs/README.md)
> **Last validated:** 2026-04-10

## Fast Facts

- Runtime:
  - `src/app/api/guiServer.js`
  - `src/app/api/guiServerRuntime.js`
- GUI:
  - `tools/gui-react/src/App.tsx`
  - `tools/gui-react/src/registries/pageRegistry.ts`
- CLI:
  - `src/app/cli/spec.js`
- Persistence:
  - AppDb: `.workspace/db/app.sqlite`
  - SpecDb: `.workspace/db/<category>/spec.sqlite`
  - authored control plane: `category_authority/`

## Read This Order

1. [docs/README.md](./docs/README.md)
2. [docs/01-project-overview/scope.md](./docs/01-project-overview/scope.md)
3. [docs/01-project-overview/folder-map.md](./docs/01-project-overview/folder-map.md)
4. [docs/02-dependencies/stack-and-toolchain.md](./docs/02-dependencies/stack-and-toolchain.md)
5. [docs/03-architecture/system-map.md](./docs/03-architecture/system-map.md)
6. [docs/04-features/feature-index.md](./docs/04-features/feature-index.md)

## Non-Negotiable Current-State Truth

- Backend route SSOT is the `routeDefinitions` array in `src/app/api/guiServerRuntime.js`.
  - Current live count: `17` route families.
- `src/app/api/routeRegistry.js` is stale as a route-order source.
  - `GUI_API_ROUTE_ORDER` currently has `14` entries.
  - Missing live keys: `unitRegistry`, `specSeeds`, `testMode`.
- GUI route SSOT is `tools/gui-react/src/registries/pageRegistry.ts`.
  - Current tabbed route count: `18`.
  - `tools/gui-react/src/App.tsx` mounts `/test-mode` separately, for `19` total GUI routes inside `AppShell`.
- There is no verified auth/session subsystem.
  - No login route.
  - No request auth middleware.
  - Sensitive config surfaces are unauthenticated.
- Storage is currently local filesystem backed.
  - `GET /api/v1/storage/overview` reports `storage_backend: "local"`.

## First Files To Trust

| Concern | Path |
|--------|------|
| backend route mounting | `src/app/api/guiServerRuntime.js` |
| request parsing + fallback | `src/app/api/requestDispatch.js` |
| server boot phases | `src/app/api/serverBootstrap.js` |
| settings registry | `src/shared/settingsRegistry.js` |
| config manifest | `src/core/config/manifest/index.js` |
| global schema | `src/db/appDbSchema.js` |
| category schema | `src/db/specDbSchema.js` |
| GUI routes | `tools/gui-react/src/registries/pageRegistry.ts` |
| GUI shell | `tools/gui-react/src/pages/layout/AppShell.tsx` |
| API client | `tools/gui-react/src/api/client.ts` |

## Known Active Drift

- `tools/gui-react/src/features/review/components/ReviewPage.tsx` still references `POST /api/v1/review/:category/finalize`, but that endpoint is not mounted by the live server.
- `npm run env:check` fails because `PORT` is referenced but missing from the config manifest coverage script baseline.
- `npm test` is currently red on 2026-04-10 with `10` failures. See [docs/05-operations/known-issues.md](./docs/05-operations/known-issues.md).

## Validation Snapshot

| Proof | Result | Date |
|------|--------|------|
| `npm run gui:build` | pass | 2026-04-10 |
| `npm run env:check` | fail (`Missing keys in config manifest: PORT`) | 2026-04-10 |
| `npm test` | fail (`7778` passed / `10` failed / `7788` total) | 2026-04-10 |
| `GET /health` | `200` | 2026-04-10 |
| `GET /api/v1/categories` | `["keyboard","monitor","mouse"]` | 2026-04-10 |
| `GET /api/v1/storage/overview` | `200`, `storage_backend: "local"` | 2026-04-10 |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | server entrypoint |
| source | `src/app/api/guiServerRuntime.js` | mounted route families and runtime assembly |
| source | `src/app/api/routeRegistry.js` | stale `GUI_API_ROUTE_ORDER` constant and missing keys |
| source | `src/app/api/requestDispatch.js` | request dispatch boundary |
| source | `src/shared/settingsRegistry.js` | settings registry SSOT |
| source | `src/core/config/manifest/index.js` | manifest sections and env coverage authority |
| source | `src/db/appDbSchema.js` | AppDb schema authority |
| source | `src/db/specDbSchema.js` | SpecDb schema authority |
| source | `tools/gui-react/src/App.tsx` | route mounting and `/test-mode` |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route inventory |
| command | `npm run gui:build` | GUI build result on 2026-04-10 |
| command | `npm run env:check` | env-check result on 2026-04-10 |
| command | `npm test` | full-suite result on 2026-04-10 |

## Related Documents

- [docs/README.md](./docs/README.md) - full documentation entrypoint and reading order.
- [docs/03-architecture/backend-architecture.md](./docs/03-architecture/backend-architecture.md) - backend runtime and route-family details.
- [docs/03-architecture/frontend-architecture.md](./docs/03-architecture/frontend-architecture.md) - GUI routing, state, and transport details.
- [docs/05-operations/known-issues.md](./docs/05-operations/known-issues.md) - current defects and drifts that should not be misdiagnosed as new regressions.
