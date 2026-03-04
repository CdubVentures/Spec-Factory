# 03-02 CLI Composition Root Thinning Plan

## Status

- Task ID: `03-02`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Completion date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Define an incremental extraction plan that thins `src/cli/spec.js` into composition-only orchestration.

## Scope

- Split command registration/dispatch from command business logic.
- Define command-family extraction order and adapter boundaries.
- Define characterization coverage for command behavior parity.
- Define rollback points per extraction slice.

## CLI Split Target (Phase 03)

`src/cli/spec.js` retains:

1. bootstrap/config initialization
2. argument parsing and command routing
3. delegation calls to app-layer command adapters

`src/cli/spec.js` no longer owns:

1. domain command business logic
2. cross-context orchestration details
3. mixed helper routines unrelated to dispatch/bootstrapping

## Command-Family Extraction Order (Scoped)

| Slice ID | Command Family | Approx Command Count | First Delegation Target | Risk Level |
|---|---|---:|---|---|
| `CLI-S1` | dispatch/bootstrap core | n/a (routing layer) | `src/app/cli/dispatch/*` (planned) | `HIGH` |
| `CLI-S2` | runtime/indexing operations | `15` | runtime-intelligence command adapter | `HIGH` |
| `CLI-S3` | rules/studio compile and ingest | `11` | studio-authoring command adapter | `MEDIUM` |
| `CLI-S4` | review/quality and scoring flows | `6` | review-curation command adapter | `MEDIUM` |
| `CLI-S5` | publishing/learning/reporting flows | `8` | publishing-learning command adapter | `LOW` |
| `CLI-S6` | ops/meta and lifecycle commands | `14` | app/infrastructure adapter + settings/runtime contracts | `MEDIUM` |

## Adapter Mapping (CLI)

| Seam ID | Slice Coverage | Replacement Contract | Owner | Expiry Phase |
|---|---|---|---|---|
| `CR-CLI-01` | `CLI-S1` | app-layer dispatch adapter only | `app/cli` | `phase-05-backend-wave-b` |
| `CR-CLI-02` | `CLI-S2`,`CLI-S3`,`CLI-S4`,`CLI-S5` | feature `index.js` contracts by family | `app/cli` | `phase-05-backend-wave-b` |
| `CR-CLI-03` | `CLI-S6` | app/infrastructure lifecycle adapters | `app/cli` | `phase-05-backend-wave-b` |

## Characterization Coverage (CLI)

Scoped characterization coverage for CLI thinning:

- dispatch contract: command token -> delegated handler path
- error contract: unknown command, invalid args, and failure exit behavior
- family parity checks for runtime/rules/review/publish/ops slices before and after delegation

Planned test artifacts:

- `test/cliCompositionRootDispatchContract.test.js`
- `test/cliCompositionRootErrorContract.test.js`

## Rollback Procedure (Per Slice)

1. complete one slice only (`CLI-Sn`) per change set
2. run slice-focused characterization + existing targeted regressions
3. if regression occurs, revert slice extraction only (not test changes)
4. log seam rollback in `06-RISK-REGISTER.md` exception format
5. reopen slice with narrowed extraction scope

## Outputs Produced

1. CLI split blueprint updates:
   - `02-COMPOSITION-ROOT-INVENTORY.md`
   - `03-DELEGATION-SEAM-RULEBOOK.md`
2. Adapter mapping updates:
   - `04-ADAPTER-REGISTRY.md`
3. Coverage and execution updates:
   - `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
   - `07-EXECUTION-CHECKLIST.md`
4. Phase status alignment:
   - `00-INDEX.md`
   - `SUMMARY.md`
   - `../00-INDEX.md`

## Validation Evidence

Commands run:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js
node --test test/sourceStrategy.test.js
```

Results:

- `5/5` passing
- `4/4` passing

## Implementation Follow-Through (CLI-S1 Landed)

Implemented extraction:

- app-layer dispatcher module: `src/app/cli/commandDispatch.js`
- `src/cli/spec.js` `main()` command dispatch chain now delegates via dispatcher registry
- characterization coverage for dispatcher behavior:
  - `test/cliCommandDispatch.test.js`

Validation commands:

```bash
node --check src/cli/spec.js
node --test test/cliCommandDispatch.test.js
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js test/runtimeSettingsApi.test.js test/reviewRoutesDataChangeContract.test.js
```

Results:

- syntax check passing
- `2/2` passing
- `22/22` passing

## Completion Criteria

- [x] Command-family extraction order is documented.
- [x] CLI adapter seams have owner and expiry phase.
- [x] Characterization coverage for CLI root behavior is defined.
- [x] Rollback procedure per extraction slice is documented.

## Next Task

- `03-03`: API composition root thinning plan.
