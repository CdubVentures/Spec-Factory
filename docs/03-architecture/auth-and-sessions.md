# Auth and Sessions

> **Purpose:** Document the live reality of authentication, session-like persistence, and permission checks so an arriving LLM does not invent a user-auth system.
> **Prerequisites:** [backend-architecture.md](./backend-architecture.md), [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-24

## Verified Reality

- No end-user login or logout flow was found in the live GUI or API.
- No verified auth middleware or route guard stack was found in `src/api/guiServer.js`, `src/app/api/requestDispatch.js`, or the route registrars.
- No emitted auth/session settings surface was verified in `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, or `src/config.js`. `src/core/config/manifest/index.js` defines a possible `security` group ID, but the current exported `CONFIG_MANIFEST` contains no populated `security` section.

## What "Session" Means In This Repo

### GUI persistence

- GUI state is persisted locally through Zustand-backed stores and browser storage patterns.
- Key files:
  - `tools/gui-react/src/stores/uiStore.ts`
  - `tools/gui-react/src/stores/tabStore.ts`
  - `tools/gui-react/src/stores/collapseStore.ts`

### Field-rules session cache

- Backend code uses a category-scoped rules/session cache that is unrelated to user authentication.
- Key files:
  - `src/field-rules/sessionCache.js`
  - `src/api/guiServer.js`
  - `src/features/category-authority/api/dataAuthorityRoutes.js`
  - `src/features/review/api/reviewRoutes.js`

## Permissions

- No role/scope matrix for users/operators was found.
- Permission-like behavior in the live runtime is feature/config driven, not user-auth driven.
- Example: `src/field-rules/consumerGate.js` is used to decide whether field-rule consumers such as review surfaces are enabled, but this is not user authorization.

## Practical Guidance

- Do not add docs that describe users, accounts, refresh tokens, login pages, or permission middleware as current behavior.
- Treat the repo as a single-operator/local-tool runtime unless you add a new verified auth system in code.
- If you need to document persistence across page loads, refer to UI state stores and user settings, not "sessions" in the web-auth sense.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsRegistry.js` | absence of live auth/session registry entries |
| source | `src/core/config/manifest/index.js` | declared group IDs versus the current emitted manifest sections |
| source | `src/config.js` | no auth/session normalization layer beyond general config loading |
| source | `src/api/guiServer.js` | no audited auth middleware in server assembly |
| source | `src/field-rules/sessionCache.js` | non-auth session cache semantics |
| source | `tools/gui-react/src/stores/uiStore.ts` | local GUI persistence behavior |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Shows the actual emitted config and user-settings surfaces.
- [Routing and GUI](./routing-and-gui.md) - Confirms no auth guards in the live route map.
- [Known Issues](../05-operations/known-issues.md) - Records current operational gotchas unrelated to a user-auth system.
