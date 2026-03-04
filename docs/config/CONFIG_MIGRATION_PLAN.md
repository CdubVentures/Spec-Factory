# Configuration Operating Standard

Last updated: 2026-03-04

## Standard

- One global default source: `src/core/config/manifest.js`.
- One runtime loader path: `src/config.js`.
- One user-settings authority path: `src/features/settings-authority/*`.

## Required implementation pattern

1. Add system knob in manifest with metadata (`key`, `defaultValue`, `type`, `secret`, `userMutable`, `description`).
2. Read knob only through `src/config.js` loader path.
3. Map runtime-editable knobs through settings contract and authority store.
4. Persist user changes as section patches, then derive/apply runtime artifacts.

## Required validation gates

- `npm run env:check`
- `npm test`

## Non-negotiable boundaries

- Do not move user-owned domain/workflow data into manifest or `.env`.
- Do not duplicate canonical ownership across manifest, `.env`, and user settings.
- Keep secrets out of source-controlled defaults.
