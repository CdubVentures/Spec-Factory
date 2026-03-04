# 03-01 Composition Root Inventory and Split Seam Map

## Status

- Task ID: `03-01`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Completion date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Build the baseline composition-root inventory and define the first split seams for CLI/API thinning.

## Scope

- Inventory current CLI composition root responsibilities and coupling.
- Inventory current API server composition root responsibilities and coupling.
- Define initial seam map for safe incremental root thinning.
- Promote baseline artifacts into canonical Phase 03 docs.

## Composition Root Baseline Evidence

| Surface | File | LOC | Import Count | Coupling Signals |
|---|---|---:|---:|---|
| CLI composition root | `src/cli/spec.js` | `2688` | `45` | `54` command functions and wide cross-domain fan-out |
| API composition root | `src/api/guiServer.js` | `2603` | `63` | route bootstrap + business helpers + process/ws flows mixed |

CLI high-fan-out roots include:

- `src/review` (`5`)
- `src/llm` (`4`)
- `src/ingest` (`3`)
- `src/pipeline` (`2`)
- `src/learning` (`2`)

API high-fan-out roots include:

- `src/api` (`26`)
- `src/catalog` (`5`)
- `src/review` (`5`)
- `src/testing` (`2`)
- `src/field-rules` (`2`)

## Initial Split Seam Map

| Seam ID | Root Surface | Seam Goal | Delegation Target | Migration Notes |
|---|---|---|---|---|
| `CR-01` | `src/cli/spec.js` | isolate bootstrapping and command dispatch | `src/app/cli/*` (planned) -> feature contracts | keep command CLI signatures unchanged |
| `CR-02` | `src/cli/spec.js` | move command business logic out of root file | feature capability adapters (`index.js` contracts) | split by command family in small increments |
| `CR-03` | `src/api/guiServer.js` | isolate route registry and server bootstrap | `src/app/api/*` (planned) -> feature route adapters | preserve route paths and response contracts |
| `CR-04` | `src/api/guiServer.js` | extract process/ws/runtime state orchestration | app-layer runtime operations adapters | avoid moving domain policy into bootstrap layer |
| `CR-05` | both roots | enforce composition-only responsibility in roots | rulebook + characterization coverage | warn-mode checks stay advisory in this phase |

## Outputs Produced

1. Baseline inventory artifact:
   - `02-COMPOSITION-ROOT-INVENTORY.md`
2. Delegation seam rules:
   - `03-DELEGATION-SEAM-RULEBOOK.md`
3. Adapter seam registry:
   - `04-ADAPTER-REGISTRY.md`
4. Characterization-test plan:
   - `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
5. Execution controls:
   - `06-RISK-REGISTER.md`
   - `07-EXECUTION-CHECKLIST.md`
   - `08-EXIT-GATES-AND-HANDOFF.md`

## Kickoff Validation

Command:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js
```

Result: `5/5` passing.

## Completion Criteria

- [x] CLI/API composition roots inventoried with measurable baseline.
- [x] Initial split seams defined and mapped to delegation targets.
- [x] Canonical Phase 03 artifacts initialized.
- [x] Kickoff regression evidence captured.

## Next Task

- `03-02`: CLI composition root thinning plan.
