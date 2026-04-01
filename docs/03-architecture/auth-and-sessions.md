# Auth and Sessions

> **Purpose:** Document the live reality of authentication, session-like persistence, and permission checks so an arriving LLM does not invent a user-auth system.
> **Prerequisites:** [backend-architecture.md](./backend-architecture.md), [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-31

## Verified Reality

- No end-user login or logout flow was found in the live GUI or API.
- No auth middleware or route guard stack was found in `src/api/guiServerRuntime.js`, `src/app/api/requestDispatch.js`, or the route registrars.
- No emitted auth/session settings surface was verified in `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, or `src/config.js`.
- `src/core/config/manifest/index.js` declares a possible `security` group ID, but the current emitted manifest contains no populated `security` section.

## What "Session" Means In This Repo

### GUI persistence

- GUI continuity is local browser state, not server-issued authentication.
- Key files:
  - `tools/gui-react/src/stores/uiStore.ts`
  - `tools/gui-react/src/stores/tabStore.ts`
  - `tools/gui-react/src/stores/collapseStore.ts`

### Backend caches

- Backend code uses non-auth session-like caches such as the field-rules session cache.
- Key files:
  - `src/field-rules/sessionCache.js`
  - `src/api/bootstrap/createBootstrapSessionLayer.js`
  - `src/features/review/api/reviewRoutes.js`

## Permissions

- No role or scope matrix for users/operators was found.
- Permission-like behavior in the live runtime is feature/config driven, not user-auth driven.
- Example: disabled tabs in `tools/gui-react/src/registries/pageRegistry.ts` depend on selected category state, not on authenticated user roles.

## Current Sensitive Exposure

- `GET /api/v1/runtime-settings` is unauthenticated and the derived runtime GET map includes provider API key fields.
- `GET /api/v1/llm-policy` is unauthenticated and returns provider-registry entries that include `apiKey` fields when configured.
- `GET /api/v1/indexing/llm-config` is unauthenticated and returns `resolved_api_keys` when configured.
- Treat the live server as trusted-network-only until an explicit auth-hardening task changes that contract.

## Practical Guidance

- Do not document users, accounts, refresh tokens, login pages, or permission middleware as current behavior.
- If you need to describe persistence across page loads, refer to local GUI stores and settings persistence, not to web-auth sessions.
- If auth work is commissioned later, re-audit `src/api/guiServerRuntime.js`, `src/app/api/requestDispatch.js`, `src/shared/settingsRegistry.js`, and the LLM settings endpoints together because they currently expose secret-bearing configuration without request auth.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | absence of auth middleware in runtime assembly |
| source | `src/app/api/requestDispatch.js` | no request-auth wrapping in dispatch |
| source | `src/shared/settingsRegistry.js` | absence of live auth/session registry entries |
| source | `src/core/config/manifest/index.js` | declared group IDs versus emitted manifest sections |
| source | `src/core/config/settingsKeyMap.js` | runtime-settings GET map is registry-derived |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | unauthenticated `/runtime-settings` response contract |
| source | `src/features/settings-authority/llmPolicyHandler.js` | unauthenticated `/llm-policy` response contract |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | unauthenticated `/indexing/llm-config` resolved key exposure |
| source | `src/field-rules/sessionCache.js` | non-auth session cache semantics |
| source | `tools/gui-react/src/stores/uiStore.ts` | local GUI persistence behavior |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Actual emitted config and user-settings surfaces.
- [Routing and GUI](./routing-and-gui.md) - Confirms there are no auth guards in the live route map.
- [Known Issues](../05-operations/known-issues.md) - Tracks the current unauthenticated sensitive endpoints.
