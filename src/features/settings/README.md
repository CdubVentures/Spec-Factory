## Purpose
Own API route registration for runtime, convergence, storage, UI, and LLM settings surfaces.
This boundary exposes the HTTP layer for settings while delegating canonical persistence and schema logic to `settings-authority`.

## Public API (The Contract)
- `src/features/settings/api/configRoutes.js`: `registerConfigRoutes(ctx)`.
- No root `src/features/settings/index.js` exists yet; route registration is the boundary contract.

## Dependencies
- Allowed: `src/features/settings-authority/index.js`, `src/api/events/dataChangeContract.js`, `src/api/services/runDataRelocationService.js`, and `src/observability/settingsPersistenceCounters.js`.
- Forbidden: ad hoc settings persistence paths that bypass the settings-authority contract.

## Domain Invariants
- Canonical settings writes flow through `settings-authority` helpers before config state is mutated.
- Route validation and coercion must stay aligned with the exported runtime and convergence route contracts.
- Successful writes emit settings-related data-change events so clients can refresh derived state.
- The canonical user settings document remains the source of truth; legacy file writes are best-effort compatibility behavior only.
