# Phase 01 Hotspot Backlog

## Ranking Criteria

- File size and responsibility breadth.
- Cross-domain fan-out and fan-in.
- Operational criticality.
- Change frequency and regression history.

## Priority A (Start Here)

1. `src/pipeline/runProduct.js`
   - Problem: orchestration + domain logic + policy + helper coupling mixed.
   - Target: split into runtime-intelligence application orchestration and domain modules.

2. `src/cli/spec.js`
   - Problem: command composition root directly imports many domain modules.
   - Target: extract command handlers into app-layer commands with feature contracts.

3. `src/api/guiServer.js`
   - Problem: bootstrap + route wiring + domain helpers mixed.
   - Target: thin bootstrap with route registry + delegated handlers only.

4. `tools/gui-react/src/pages/studio/StudioPage.tsx`
   - Problem: oversized mixed UI + data + authority coordination.
   - Target: feature-sliced studio-authoring components/hooks/stores.

5. `tools/gui-react/src/pages/indexing/IndexingPage.tsx`
   - Problem: oversized runtime-intelligence surface mixed with settings and panel orchestration.
   - Target: split by runtime-intelligence subcontexts (`indexing-lab`, `runtime-ops`, `shared`).

## Priority B

1. `src/ingest/categoryCompile.js`
2. `src/db/specDb.js`
3. `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx`
4. `src/api/routes/indexlabDataBuilders.js`
5. `src/api/routes/runtimeOpsDataBuilders.js`

## Priority C

- Generic utility concentration in:
  - `src/utils/*`
  - `src/api/helpers/requestHelpers.js`
- Long-tail page/store coupling in runtime and review surfaces.

## Sequencing Rule

Always extract by seam and keep behavior unchanged per step:

1. Add characterization tests.
2. Extract one responsibility.
3. Re-run focused suites.
4. Re-run broader contract suites.
