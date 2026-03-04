# Phase 01 Baseline Snapshot

Snapshot date: 2026-02-26

## Topline Metrics

- Backend (`src/`): `301` files, `122421` LOC
- Frontend (`tools/gui-react/src/`): `231` files, `56135` LOC
- Tests (`test/`): `416` test files, `80585` LOC

## Structure Density

- Backend top-level directories: `55` (plus root-level `config.js`, `constants.js`, `logger.js`)
- Frontend top-level buckets: `10`
- Backend largest domains by LOC:
  - `api` (~18871)
  - `ingest` (~8403)
  - `pipeline` (~7410)
  - `llm` (~7401)
  - `db` (~6819)
- Frontend concentration:
  - `pages` (~47017 LOC)
  - `stores` (~4040 LOC)
  - `components` (~3591 LOC)

## Hotspot Files (Backend)

- `src/ingest/categoryCompile.js` (~6277 lines)
- `src/db/specDb.js` (~4471 lines)
- `src/pipeline/runProduct.js` (~3965 lines)
- `src/cli/spec.js` (~2688 lines)
- `src/api/guiServer.js` (~2603 lines)

## Hotspot Files (Frontend)

- `tools/gui-react/src/pages/studio/StudioPage.tsx` (~5125 lines)
- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` (~4231 lines)
- `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx` (~1680 lines)
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx` (~1302 lines)

## Coupling Signals

- Backend orchestration fan-out is concentrated in:
  - `src/pipeline/runProduct.js`
  - `src/cli/spec.js`
  - `src/api/guiServer.js`
- Frontend cross-touchpoint concentration is highest in:
  - `StudioPage.tsx`
  - `IndexingPage.tsx`
  - `ReviewPage.tsx`
- Runtime coupling note:
  - `indexing` and `runtime-ops` share bidirectional imports, now grouped under `runtime-intelligence` in the target hierarchy.

## Repro Commands

```bash
# file counts
rg --files src | wc -l
rg --files tools/gui-react/src | wc -l
rg --files test | rg "\.test\.js$" | wc -l

# line counts (node one-liners/scripts can be used)
node --eval "/* sum LOC under src */"
node --eval "/* sum LOC under tools/gui-react/src */"
node --eval "/* sum LOC under test *.test.js */"

# large file hotspots
## backend
rg --files src | rg "\.(js|mjs|cjs)$"
## frontend
rg --files tools/gui-react/src | rg "\.(ts|tsx)$"
```

## Baseline Lock

This snapshot is the reference baseline for Phase 02 contract design and for validating that decomposition reduces coupling rather than redistributing it.
