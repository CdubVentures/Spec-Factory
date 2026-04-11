## Purpose

Phase modules for server bootstrap. Each phase initializes one layer of the DI context.

## Public API (The Contract)

- `createBootstrapEnvironment.js` → `createBootstrapEnvironment({ projectRoot })` — config, paths, storage
- `createBootstrapSessionLayer.js` → `createBootstrapSessionLayer({ config, HELPER_ROOT, storage })` — session cache, SpecDb
- `createBootstrapDomainRuntimes.js` → `createBootstrapDomainRuntimes({ config, HELPER_ROOT, storage, getSpecDb, cleanVariant, catalogKey })` — review + catalog runtimes

## Dependencies

- Allowed: `src/core/*`, `src/shared/*`, `src/features/*/index.js`, `src/app/api/helpers/*`, `src/app/api/services/*`, `src/db/specDb.js`
- Forbidden: Direct imports from `src/features/*/` internal paths (non-API, non-index)

## Domain Invariants

- Phase ordering: environment → session → domain. Each phase receives outputs of prior phases.
- The assembled return shape (8 groups, 49 keys total) is the contract with guiServer.js. Never add/remove keys without updating guiServer.js and BOOTSTRAP_RETURN_GROUPS.
- Realtime bridge + process manager stay in the assembler due to circular closure binding.
