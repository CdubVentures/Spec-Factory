## Purpose
Own the canonical schema, validation, migration, snapshot, and persistence logic for user settings.
This boundary is the single source of truth for settings defaults, typed route contracts, and `user-settings.json` persistence behavior.

## Public API (The Contract)
- `src/features/settings-authority/index.js`: re-exports `settingsContract.js`, `userSettingsService.js`, and `src/shared/settingsDefaults.js`.
- `settingsContract.js`: document metadata constants, runtime/UI/storage key sets and value types, route-contract exports, `SETTINGS_AUTHORITY_PRECEDENCE`, `UI_SETTINGS_DEFAULTS`, and `validateUserSettingsSnapshot()`.
- `userSettingsService.js`: `readStudioMapFromUserSettings()`, `loadUserSettingsSync()`, `loadUserSettings()`, `persistUserSettingsSections()`, snapshot helpers, config-application helpers, `sanitizeUserSettingsSettings()`, and `deriveSettingsArtifactsFromUserSettings()`.
- `runtimeSettingsRouteContract.js`: canonical runtime route-contract constants.

## Dependencies
- Allowed: `src/shared/settingsDefaults.js`, `src/api/services/runDataRelocationService.js`, `src/observability/settingsPersistenceCounters.js`, Node `fs/path`, and `ajv`.
- Forbidden: feature-specific settings schemas or persistence formats that diverge from this contract.

## Domain Invariants
- `user-settings.json` is the canonical persisted document for runtime, storage, UI, and studio sections (convergence section is retained as `{}` for backward compatibility only).
- Incoming settings are migrated, sanitized, and validated against typed contracts before they are exposed or persisted.
- Shared defaults come from `src/shared/settingsDefaults.js`; this boundary must not invent competing default sources.
- Persistence ordering is serialized so concurrent writes do not corrupt the canonical settings document.
