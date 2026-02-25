# Settings Authority Handoff (2026-02-25)

## Final authority contract

### Canonical settings domains
- `runtime`: runtime execution/search/llm/fetch knobs.
- `convergence`: loop/scoring/triage/retrieval knobs.
- `storage`: run-data relocation settings.
- `ui`: autosave mode toggles and shared UI settings state.
- `llm routes`: category-scoped route matrix rows.
- `source strategy`: category-scoped source-strategy table rows.
- `studio map/docs`: field-studio persisted map/docs payloads.

### Canonical persistence targets
- Global settings envelope: `helper_files/_runtime/user-settings.json`.
- Runtime snapshot: `helper_files/_runtime/runtime-settings.json`.
- Convergence snapshot: `helper_files/_runtime/convergence-settings.json`.
- Storage snapshot: `helper_files/_runtime/storage-settings.json`.
- Category-scoped route tables and source-strategy: SpecDb (`src/db/specDb.js`) by category.
- Studio map/docs: control-plane map/doc routes under category helper files.

### Route ownership (authoritative write/read)
- `/runtime-settings`: owned by `tools/gui-react/src/stores/runtimeSettingsAuthority.ts`, persisted by backend config routes.
- `/convergence-settings`: owned by `tools/gui-react/src/stores/convergenceSettingsAuthority.ts`, persisted by backend config routes.
- `/storage-settings`: owned by `tools/gui-react/src/stores/storageSettingsAuthority.ts`, persisted by backend config routes.
- `/ui-settings`: owned by `tools/gui-react/src/stores/uiSettingsAuthority.ts` + `settingsAuthority.ts`, persisted to `user-settings.json`.
- `/llm-settings/:category/routes`: owned by `tools/gui-react/src/stores/llmSettingsAuthority.ts`, persisted in category SpecDb route matrix.
- `/source-strategy`: owned by `tools/gui-react/src/stores/sourceStrategyAuthority.ts`, persisted in category SpecDb source_strategy table.
- Studio map/docs routes: owned by `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts`.

## Source map (writers -> authority -> route -> persisted target)

### Runtime + convergence
- Writers:
  - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`
  - `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`
  - `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` (convergence)
- Authorities:
  - `runtimeSettingsAuthority.ts`
  - `convergenceSettingsAuthority.ts`
- Routes:
  - `/runtime-settings`
  - `/convergence-settings`
- Persisted targets:
  - runtime/convergence snapshot files + `user-settings.json`.

### Storage
- Writer: `tools/gui-react/src/pages/storage/StoragePage.tsx`.
- Authority: `tools/gui-react/src/stores/storageSettingsAuthority.ts`.
- Route: `/storage-settings`.
- Persisted targets: storage snapshot file + `user-settings.json`.

### UI autosave
- Writers:
  - `StudioPage`, `IndexingPage`, `StoragePage`, `LlmSettingsPage`.
- Authorities/stores:
  - `uiStore.ts`
  - `uiSettingsAuthority.ts`
  - `settingsAuthority.ts`
- Route: `/ui-settings`.
- Persisted target: `user-settings.json`.

### LLM route matrix
- Writer: `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`.
- Authority: `tools/gui-react/src/stores/llmSettingsAuthority.ts`.
- Routes:
  - `/llm-settings/:category/routes`
  - `/llm-settings/:category/routes/reset`
- Persisted target: category SpecDb route matrix tables.

### Source strategy
- Writer: `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`.
- Authority: `tools/gui-react/src/stores/sourceStrategyAuthority.ts`.
- Routes:
  - `/source-strategy`
  - `/source-strategy/:id`
- Persisted target: category SpecDb `source_strategy` table.

### Studio map/docs
- Writer: `tools/gui-react/src/pages/studio/StudioPage.tsx`.
- Authority: `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts`.
- Routes: studio map/docs endpoints in `src/api/routes/studioRoutes.js`.
- Persisted target: category control-plane map/docs files.

## Subscriber map (events -> invalidation -> consumers)

- Event contract:
  - `src/api/events/dataChangeContract.js`.
- Frontend invalidation map:
  - `tools/gui-react/src/api/dataChangeInvalidationMap.js`.
- Invalidation scheduler/subscriber:
  - `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
  - `tools/gui-react/src/hooks/useDataChangeSubscription.js`.
- Settings consumers:
  - Page-level authority hooks and `useAuthoritySnapshot` readers.
  - Runtime Ops downstream surfaces (`WorkersTab` and prefetch panels) consume runtime authority snapshot projections.

## Invariants and anti-patterns

### Required invariants
- Page components do not call settings endpoints directly.
- Authority modules own endpoint usage and query-key cache reads.
- Shared knobs exposed on multiple surfaces map to a single authority key.
- Save status text must reflect actual persistence result (success/partial/error), not optimistic assumption.
- Autosave retry suppression uses payload fingerprints to avoid retry loops on unchanged failed payloads.
- UI autosave defaults/timings are contract-owned in `settingsManifest.ts`.

### Anti-patterns to reject
- New direct `api.get/put/post` settings calls from pages/components.
- New page-local `.getQueryData(...)` reads for settings bootstrap/hydration.
- Hardcoded fallback literals that duplicate manifest defaults.
- Duplicate per-surface key maps that drift from canonical route contract keys.
- “Saved” labels set before persistence promise resolves.

## Maintenance checklist for future settings

1. Add key to canonical domain contract/manifest (`settingsContract` or `settingsManifest`).
2. Add authority read/write sanitization for the key.
3. Wire UI writer to authority action (not direct endpoint call).
4. Wire all readers/consumers to authority selectors/snapshots.
5. Add route persistence test (success + error/rollback path where relevant).
6. Add GUI persistence test proving value survives reload and appears on duplicate surfaces.
7. Add propagation/invalidation coverage if value affects cross-surface visuals/runtime behavior.
8. Update `AGENTS.md` matrix lines and this handoff doc with evidence.

## Current validation evidence snapshot

- Full settings authority + propagation matrix revalidation: `108/108` passing (latest local run).
- GUI persistence coverage:
  - studio autosave shared-tab lock + reload.
  - runtime setting cross-page propagation.
  - storage manual/autosave reload durability.
  - llm route matrix manual/autosave reload durability.
  - convergence runtime-panel save/reload durability.
  - source-strategy toggle save/reload durability.
  - convergence cross-surface (pipeline <-> runtime panel) sync + reload durability.
