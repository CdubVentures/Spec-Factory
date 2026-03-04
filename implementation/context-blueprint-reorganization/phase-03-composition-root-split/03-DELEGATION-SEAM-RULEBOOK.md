# Phase 03 Delegation Seam Rulebook

## Composition-Root Direction Rule

```text
composition roots -> adapters/contracts -> feature implementations
```

Composition roots own wiring only. Feature/domain behavior must be delegated.

## Allowed

1. Composition roots may:
   - initialize config/bootstrap dependencies
   - register commands/routes
   - invoke contract-aware adapters
2. App-layer adapters may call feature public contracts only.
3. Transitional adapter seams are allowed when tracked in `04-ADAPTER-REGISTRY.md`.

## Forbidden

1. New domain business logic added directly in composition root files.
2. Composition roots importing deep cross-domain internals when adapter/contract seams exist.
3. Feature internals importing composition-root files.
4. Expanding mixed helper clusters inside `src/cli/spec.js` or `src/api/guiServer.js`.

## Requires Adapter (Transitional)

1. Existing command bodies in `src/cli/spec.js` that directly coordinate domain modules.
2. Existing mixed helper logic in `src/api/guiServer.js` that combines bootstrap + business behavior.
3. Runtime/process/ws orchestration currently coupled to root files.

Each adapter seam must include:

- seam id
- owner
- replacement contract path
- expiry phase
- validation tests

## CLI Slice Rules (03-02)

1. Split dispatch/bootstrap (`CLI-S1`) before migrating command families.
2. Migrate one command family slice per change set (`CLI-S2` through `CLI-S6`).
3. Every migrated command handler must delegate through app-layer adapters, not direct cross-domain imports from `spec.js`.
4. Rollback unit is one slice only; multi-slice rollback is disallowed unless explicitly logged as exception.

## API Slice Rules (03-03)

1. Extract bootstrap/dispatch shell (`API-S1`) before moving mixed helpers.
2. Keep route registry extraction (`API-S2`) contract-preserving and path-stable.
3. Move one API slice per change set (`API-S3` through `API-S5`).
4. Process and ws lifecycle seams (`API-S4`,`API-S5`) require targeted lifecycle regressions before marking slice complete.

## Phase Enforcement Stages

1. Phase 03: codify and apply seam rules while keeping guardrails advisory.
2. Phase 04-06: reduce root-file responsibilities and unresolved seams by migration area.
3. Phase 07: enforce composition-root boundary checks in blocking mode via CI policy.

## Governance

- Rule changes require synchronized updates to:
  - `02-COMPOSITION-ROOT-INVENTORY.md`
  - `04-ADAPTER-REGISTRY.md`
  - `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
- Rule exceptions must be logged in:
  - `06-RISK-REGISTER.md`
