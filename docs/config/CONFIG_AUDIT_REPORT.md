# Configuration Current State

Last updated: 2026-03-04

## System of record

- Global defaults: `src/core/config/manifest.js`
- Runtime loader: `src/config.js`
- User settings authority: `src/features/settings-authority/*`
- API persistence/apply layer: `src/api/routes/configRoutes.js`

## Active ownership model

- Manifest owns system-level defaults and non-secret operational knobs.
- `.env` owns secrets and environment-specific overrides.
- User settings storage owns user-mutable app settings and per-user workflow state.

## User-scope exclusions from global config

- Categories, brands, models, variants.
- Created components and enum content.
- Field rules and key navigation authoring.
- Mapping Studio and user workflow/UI preferences.

## Runtime precedence

1. Manifest defaults are applied.
2. `.env` overrides are applied.
3. User settings sections are loaded and applied as runtime artifacts.

## Operational status

- Config defaults are centralized in manifest.
- `.env` is minimal by policy.
- Canonical section persistence is active for runtime, convergence, storage, and UI settings.
