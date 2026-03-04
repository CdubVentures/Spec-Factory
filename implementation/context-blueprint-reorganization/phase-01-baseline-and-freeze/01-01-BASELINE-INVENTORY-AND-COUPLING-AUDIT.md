# 01-01 Baseline Inventory and Coupling Audit

## Status

- Task ID: `01-01`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Capture the initial structural baseline (size, hotspots, coupling) that all later phases must measure against.

## Scope

- Backend inventory (`src/`)
- Frontend inventory (`tools/gui-react/src/`)
- Test inventory (`test/`)
- High-level coupling signals and hotspot ranking

## Outputs Produced

1. Baseline metrics and hotspot summary:
   - `02-BASELINE-SNAPSHOT.md`
2. Prioritized decomposition targets:
   - `04-HOTSPOT-BACKLOG.md`
3. Runtime coupling grouping decision:
   - reflected in `../TARGET-HIERARCHY.md` (`runtime-intelligence`)

## Baseline Evidence (Current)

- Backend: `301` files, `122421` LOC
- Frontend: `231` files, `56135` LOC
- Tests: `416` files, `80585` LOC
- Major backend hotspots include:
  - `src/pipeline/runProduct.js`
  - `src/cli/spec.js`
  - `src/api/guiServer.js`
- Major frontend hotspots include:
  - `tools/gui-react/src/pages/studio/StudioPage.tsx`
  - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`

## Completion Criteria

- [x] Baseline counts documented
- [x] Hotspot list documented
- [x] Coupling observations documented
- [x] Runtime-intelligence grouping decision documented
- [x] Work-item evidence captured and linked in Phase 01 package

## Next Task

- `01-02`: Freeze enforcement audit and exception-control activation check.
