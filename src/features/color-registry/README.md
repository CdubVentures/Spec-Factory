## Purpose
Global color registry CRUD and persistence. Manages the EG CSS palette (base colors, light/dark variants) as a single source of truth, seeded at boot and persisted to JSON on every mutation.

## Public API (The Contract)
- `src/features/color-registry/index.js`:
  - `seedColorRegistry(appDb, colorRegistryPath)` — Initialize DB from JSON or defaults (idempotent).
  - `writeBackColorRegistry(appDb, colorRegistryPath)` — Persist current DB state to JSON (fire-and-forget).
  - `EG_DEFAULT_COLORS` — Frozen array of default color entries with name + hex.
  - `registerColorRoutes(ctx)` — Register GET/POST/PUT/DELETE endpoints for color CRUD.
  - `createColorRouteContext(options)` — Build route context with appDb, broadcastWs, colorRegistryPath.

## Dependencies
- Allowed: `src/db/appDb.js` (color table CRUD), `src/core/events/dataChangeContract.js` (data-change broadcasts).
- Forbidden: Cross-feature imports.

## Domain Invariants
- Color registry is always seeded at bootstrap; no empty registry is ever valid at runtime.
- Seeding is idempotent: re-running does not overwrite existing user-edited hex values.
- Write-back to JSON is non-critical; failures do not block route responses.
- Color names: lowercase alphanumeric + hyphens only. Modifier-first naming (light-blue, not blue-light).
- Hex values: #RRGGBB format, validated on input.
- CSS variable names derived as `--color-{name}`, never stored as user input.
- Colors flow to EG presets via `appDb.listColors()` → `ctx.colorNames` → `buildEgColorFieldRule(ctx)`.
