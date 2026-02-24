# 04 - Data Authority Subscribers and Live Propagation

Last verified: 2026-02-24

## Subscriber inventory

## Studio store contract (authoring state)

Store file:

- `tools/gui-react/src/pages/studio/useFieldRulesStore.ts`

State fields:

- `editedRules`
- `editedFieldOrder` (includes `__grp::` group markers)
- `pendingRenames`
- `initialized`

Key actions:

- lifecycle: `hydrate`, `rehydrate`, `reset`, `clearRenames`
- field edits: `updateField`, `addKey`, `removeKey`, `renameKey`, `bulkAddKeys`
- order/group edits: `reorder`, `addGroup`, `removeGroup`, `renameGroup`
- save payload source: `getSnapshot`

Authority note:

- This store is local editor state, not persisted authority by itself.
- Persisted authority writes occur through authority-owned mutation modules:
  - `studioPersistenceAuthority.ts` for `save-drafts` and `field-studio-map`
  - `runtimeSettingsAuthority.ts`, `convergenceSettingsAuthority.ts`, and `llmSettingsAuthority.ts` for settings surfaces
  - compile remains route-owned (`POST /studio/{category}/compile`)

## 1) WebSocket transport subscriber boundary

File: `src/api/guiServer.js`

- Clients subscribe to channels via `/ws` message payload (`subscribe`, `category`, `productId`).
- `data-change` payloads are filtered by category using `dataChangeMatchesCategory`.
- `category='all'` handling supports wildcard behavior through payload category/category-list rules.

## 2) Global frontend subscriber

Files:

- `tools/gui-react/src/components/layout/AppShell.tsx`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/api/dataChangeInvalidationMap.js`

Behavior:

- App shell subscribes to `events`, `process`, `process-status`, `data-change`, `test-import-progress`, and `indexlab-event`.
- `data-change` traffic is routed through the invalidation scheduler.
- Domains are resolved from payload `domains` first, then event fallback map.
- Query keys are materialized per scoped category and deduped before invalidation.

## 2b) Test mode progress subscriber

Files:

- `tools/gui-react/src/pages/test-mode/TestModePage.tsx`

Behavior:

- `test-import-progress` frames are consumed as live progress updates.
- This channel is intentionally separate from `data-change` invalidation.

## 2c) Runtime screencast subscriber

Files:

- `tools/gui-react/src/pages/runtime-ops/panels/BrowserStream.tsx`

Behavior:

- Uses direct WS subscribe/unsubscribe messages (`screencast_subscribe`, `screencast_unsubscribe`).
- Consumes `screencast-*` channels for image frames.
- This stream is telemetry/visual only; it does not drive query invalidation.

## 2d) Settings authority bootstrap

Files:

- `tools/gui-react/src/stores/settingsAuthority.ts`
- `tools/gui-react/src/components/layout/AppShell.tsx`

Behavior:

- App shell invokes `useSettingsAuthorityBootstrap()` once at startup.
- Bootstrap composes shared settings authorities and triggers one-time `runtime.reload()` and `convergence.reload()`.
- Settings consumers subscribe through authority hooks/store selectors instead of direct page-level route ownership.

## 3) Scoped authority snapshot subscriber

Files:

- `tools/gui-react/src/hooks/useDataChangeSubscription.js`
- `tools/gui-react/src/hooks/dataChangeSubscriptionHelpers.js`
- `tools/gui-react/src/hooks/useAuthoritySnapshot.js`
- `tools/gui-react/src/hooks/authoritySnapshotHelpers.js`

Behavior:

- Studio uses `useAuthoritySnapshot` with category scope.
- Any relevant data-change invalidates `['data-authority','snapshot',category]`.
- Hook also invalidates domain query families derived from the shared map.

## 4) Studio local conflict subscriber flow

Files:

- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/studio/authoritySync.js`

Behavior:

- Studio computes current authority token from snapshot (fallback to local timestamps when needed).
- On version change with unsaved local edits, it enters explicit conflict state.
- User chooses:
  - load server snapshot (rehydrate)
  - keep local draft (ignore specific conflict version)
- Auto-save pauses while unresolved conflict is active.

## Subscriber-to-domain mapping summary

| Subscriber | Category scope | Domain scope | Action |
|---|---|---|---|
| WS server category filter | per socket | all `data-change` | drop non-matching payloads |
| AppShell scheduler | app active category | all mapped domains | invalidate mapped React Query keys |
| TestMode progress listener | none | `test-import-progress` | update import progress state |
| Runtime BrowserStream | none | `screencast-*` | render live frames |
| Settings bootstrap | app startup | settings slices | one-time hydrate/reload of shared settings authorities |
| useAuthoritySnapshot | hook category | `AUTHORITY_SNAPSHOT_DOMAINS` | invalidate snapshot + mapped keys |
| Studio authority sync | Studio page category | authority token only | hydrate/rehydrate/conflict |

## Query invalidation ownership

- Domain templates live in `tools/gui-react/src/api/dataChangeInvalidationMap.js`.
- Category scoping lives in `tools/gui-react/src/components/layout/dataChangeScope.js`.
- Batch/flush behavior lives in `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`.
- Query families intentionally refreshed outside `data-change`: `billing`, `learning`, `data-authority`, `indexlab`, `processStatus`, `runtime-ops`, `searxng` (polling/manual invalidation paths).

## Adding a new subscriber safely

1. Add or update event->domain mapping in backend contract.
2. Mirror mapping in frontend fallback map.
3. Add domain query templates for the target surface.
4. Add/adjust subscriber category filters.
5. Add parity/contract tests.

Minimum test set:

- `test/dataChangeContract.test.js`
- `test/dataChangeInvalidationMap.test.js`
- `test/dataChangeDomainParity.test.js`
- `test/wsSubscriptionWiring.test.js`
