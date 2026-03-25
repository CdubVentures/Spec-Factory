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
4. compatibility fallbacks still present in `src/config.js`

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

## File Structure

`manifest.js` is a thin shim that re-exports from the decomposed directory:

```
src/core/config/
  manifest.js               <- 9-line shim (re-exports from manifest/)
  manifest/
    index.js                <- assembly (imports all groups, exports public API)
    coreGroup.js            <- boot/runtime entries
    cachingGroup.js         <- cache-related entries
    storageGroup.js         <- storage and object-path entries
    securityGroup.js        <- security-related entries
    llmGroup.js             <- model routing, pricing, and fallback entries
    discoveryGroup.js       <- discovery-provider entries
    retrievalGroup.js       <- retrieval and scoring entries
    runtimeGroup.js         <- pipeline, fetch, parse, and OCR entries
    observabilityGroup.js   <- tracing and diagnostics entries
    pathsGroup.js           <- filesystem path and frontier-tuning entries
    miscGroup.js            <- compatibility and overflow entries
```

To add a new setting, edit the appropriate `<groupId>Group.js` file.

## Validation
`npm run env:check` checks whether runtime env references are covered by the manifest key inventory.
