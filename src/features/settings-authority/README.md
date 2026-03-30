## Purpose
Own the canonical schema, validation, migration, snapshot, and persistence logic for user settings.
This boundary is the single source of truth for settings defaults, typed route contracts, and settings persistence behavior (SQL via app.sqlite, JSON boot fallback).

## Public API (The Contract)
- `src/features/settings-authority/index.js`: re-exports `settingsContract.js`, `userSettingsService.js`, and `src/shared/settingsDefaults.js`.
- `settingsContract.js`: document metadata constants, runtime/UI/storage key sets and value types, route-contract exports, `SETTINGS_AUTHORITY_PRECEDENCE`, `UI_SETTINGS_DEFAULTS`, and `validateUserSettingsSnapshot()`.
- `userSettingsService.js`: `loadUserSettingsSync()`, `loadUserSettings()`, `persistUserSettingsSections()`, `drainPersistQueue()`, snapshot helpers, config-application helpers, and `deriveSettingsArtifactsFromUserSettings()`.
- `runtimeSettingsRouteContract.js`: canonical runtime route-contract constants.

## Dependencies
- Allowed: `src/shared/settingsDefaults.js`, `src/api/services/runDataRelocationService.js`, `src/observability/settingsPersistenceCounters.js`, Node `fs/path`, and `ajv`.
- Forbidden: feature-specific settings schemas or persistence formats that diverge from this contract.

## Domain Invariants
- `app.sqlite` (settings + studio_maps tables) is the canonical persisted store for runtime, storage, UI, and studio sections. `user-settings.json` is read-only fallback for boot path only (before appDb exists). Convergence section is retained as `{}` for backward compatibility only.
- Incoming settings are migrated, sanitized, and validated against typed contracts before they are exposed or persisted.
- Shared defaults come from `src/shared/settingsDefaults.js`; this boundary must not invent competing default sources.
- SQL writes are synchronous via better-sqlite3; WAL mode handles concurrency.
