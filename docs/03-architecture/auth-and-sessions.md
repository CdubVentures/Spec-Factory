# Auth and Sessions

> **Purpose:** Record the verified absence of user authentication plus the session-like persistence surfaces that do exist, so an arriving LLM does not hallucinate a login system.
> **Prerequisites:** [backend-architecture.md](./backend-architecture.md), [frontend-architecture.md](./frontend-architecture.md), [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md)
> **Last validated:** 2026-04-10

## Verified Reality

- No login endpoint, logout endpoint, token issuer, cookie session middleware, or user account model was found in the live server.
- No auth middleware or request guard is mounted in `src/app/api/guiServerRuntime.js` or `src/app/api/requestDispatch.js`.
- No GUI route guard is mounted in `tools/gui-react/src/App.tsx`.
- The current runtime should be treated as trusted-network-only. Several configuration endpoints are unauthenticated and can expose secret-bearing fields.

## Auth Flow

There is no authenticated login flow in the current repo.

Actual request flow for a browser user is:

1. `tools/gui-react/src/main.tsx` boots the SPA with no credential bootstrap.
2. `tools/gui-react/src/App.tsx` mounts routes directly under `HashRouter` with no auth gate.
3. Browser requests hit `src/app/api/requestDispatch.js`, which dispatches directly to handlers based on path only.
4. Settings and policy endpoints return data without a user identity check.

## Token / Session Model

There is no issued token or server-authenticated browser session in the live implementation.

Session-like persistence that does exist:

| Surface | Files | Role |
|---------|-------|------|
| bootstrap session layer | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | alias resolver, lazy SpecDb runtime, session cache, eager AppDb open |
| field-rules session cache | `src/field-rules/sessionCache.js` | caches category config and related review-layout data |
| persisted runtime/UI settings | `src/features/settings/api/configPersistenceContext.js`, `src/features/settings-authority/userSettingsService.js` | AppDb-backed settings persistence with JSON fallback |
| browser local UI state | `tools/gui-react/src/stores/uiStore.ts`, `tools/gui-react/src/stores/tabStore.ts`, `tools/gui-react/src/stores/collapseStore.ts` | client continuity across page navigation and reloads |

## Permission Model

No user-role or scope system was verified.

Current behavior gates are feature-state or data-state driven:

- `tools/gui-react/src/registries/pageRegistry.ts` exposes `disabledOnAll` metadata for some tabs based on feature state, not user identity.
- Category-scoped endpoints rely on the selected category and alias resolution, not on user permissions.
- Sensitive operations such as storage deletion and runtime settings writes are controlled by endpoint contracts, not by auth middleware.

## Sensitive Unauthenticated Endpoints

| Endpoint | Handler file | Verified behavior |
|----------|--------------|-------------------|
| `GET /api/v1/runtime-settings` | `src/features/settings/api/configRuntimeSettingsHandler.js` | returns derived runtime settings and can expose provider key fields when configured |
| `GET /api/v1/llm-policy` | `src/features/settings-authority/llmPolicyHandler.js` | returns composite LLM policy and provider metadata without request auth |
| `GET /api/v1/indexing/llm-config` | `src/features/settings/api/configIndexingMetricsHandler.js` | returns routing snapshot plus resolved API-key state without request auth |

## Guidance For Future Work

- Do not document users, accounts, refresh tokens, JWTs, sessions, or permission middleware as current behavior.
- If a later task introduces real auth, re-audit these files together:
  - `src/app/api/guiServerRuntime.js`
  - `src/app/api/requestDispatch.js`
  - `tools/gui-react/src/App.tsx`
  - `src/features/settings/api/configRuntimeSettingsHandler.js`
  - `src/features/settings-authority/llmPolicyHandler.js`
  - `src/features/settings/api/configIndexingMetricsHandler.js`

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServerRuntime.js` | absence of auth middleware in runtime assembly |
| source | `src/app/api/requestDispatch.js` | direct path-based dispatch with no auth wrapper |
| source | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | actual meaning of "session layer" in this repo |
| source | `src/field-rules/sessionCache.js` | non-auth session cache semantics |
| source | `tools/gui-react/src/App.tsx` | route tree has no auth guard |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route metadata is feature-state based, not user-role based |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | unauthenticated runtime-settings response contract |
| source | `src/features/settings-authority/llmPolicyHandler.js` | unauthenticated LLM policy response contract |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | unauthenticated indexing LLM config response contract |
| source | `src/features/settings/api/configPersistenceContext.js` | settings persistence behavior |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Actual config and settings surfaces exposed by the server.
- [Routing and GUI](./routing-and-gui.md) - Confirms there are no route guards in the GUI.
- [Known Issues](../05-operations/known-issues.md) - Tracks current unauthenticated sensitive-surface drift and other operator gotchas.
