## Purpose
Own truly shared settings defaults and option metadata that can be consumed by multiple domains without bringing in feature logic.
This boundary stays intentionally small so shared values remain stable and dependency-light.

## Public API (The Contract)
- `src/shared/settingsDefaults.js`: `SETTINGS_DEFAULTS`, `SETTINGS_OPTION_VALUES`.
- `src/shared/settingsDefaults.d.ts`: TypeScript declarations for the settings defaults contract.
- `src/shared/settingsClampingRanges.js`: `SETTINGS_CLAMPING_INT_RANGE_MAP`, `SETTINGS_CLAMPING_FLOAT_RANGE_MAP`, `SETTINGS_CLAMPING_STRING_ENUM_MAP` — SSOT clamping ranges consumed by both `core/config/` and `features/settings-authority/`.
- `src/shared/valueNormalizers.js`: `toInt`, `toFloat`, `toUnitRatio`, `hasKnownValue`, `isKnownValue`, `normalizeModelToken`, `normalizePathToken`, `normalizeJsonText`, `normalizeDomainToken`, `domainFromUrl`, and other pure type coercion utilities.
- `src/shared/fileHelpers.js`: `safeReadJson`, `safeStat`, `listDirs`, `listFiles`, `readJsonlEvents`, `readGzipJsonlEvents`, `parseNdjson`, `safeJoin`, and other safe file I/O utilities.

## Dependencies
- Allowed: dependency-light modules that remain generic across the repo.
- Forbidden: feature code, app wiring, API route logic, or domain-specific state.

## Domain Invariants
- `SETTINGS_DEFAULTS` and `SETTINGS_OPTION_VALUES` are frozen canonical values, not mutable runtime state.
- Shared exports must remain generic and reusable; feature-specific defaults do not belong here.
- Downstream settings contracts should derive from this boundary instead of duplicating default values.
