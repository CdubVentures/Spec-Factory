## Purpose

CLI entrypoint and command dispatcher for Spec Factory. Receives user commands, parses arguments, boots config/storage, and dispatches to domain-specific command factories.

## Public API (The Contract)

- `executeCli(argv, opts)` — programmatic CLI entry (from `spec.js`)
- `parseArgs(argv)` / `asBool(value)` — argument parsing (from `args.js`)
- `commands/*.js` — thin command factories, each receiving injected deps

## Dependencies

Allowed: `src/core/`, `src/shared/`, `src/features/*/index.js` (public APIs only), `src/db/`
Forbidden: other `src/app/` subdomains, feature internals

## Domain Invariants

- Commands are thin factories — domain logic lives in features, not here
- All feature imports must go through public `index.js` exports
- `spec.js` is the sole CLI entrypoint; all process spawning uses `src/app/cli/spec.js`
