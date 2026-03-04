# Config Manifest

## Purpose
`src/core/config/manifest.js` is the canonical inventory for system-level settings.

It defines:
- setting key
- default value
- type
- secret flag
- mutability intent
- section-level documentation

## Precedence
Runtime config resolves in this order:
1. `user-settings` explicit overrides (when present)
2. environment values (`process.env`)
3. manifest defaults (applied at `loadConfig()` bootstrap)
4. legacy code fallbacks (backward-compatibility only)

Target end-state:
- remove legacy fallback duplication from `src/config.js`
- keep defaults only in manifest + user overrides

## Scope Boundaries
Manifest includes only system/application settings.

Manifest must **not** include user/domain-generated data:
- categories
- brands/models/variants
- components
- enums/known values
- field rules
- key-navigation payloads
- mapping studio payloads

Those live in user settings and/or domain data stores.

## Operational Policy
- Add new settings to manifest first.
- Keep descriptions and section notes updated.
- Mark secrets with `secret: true`.
- Mark defaults that should be user-adjustable through settings APIs as `userMutable: true` only when routed through canonical user-settings.

## Validation
`npm run env:check` validates that runtime env references are covered by the manifest key inventory.
