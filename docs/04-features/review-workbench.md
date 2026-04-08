# Review Workbench

> **Purpose:** Document the verified scalar, component, and enum review flows from the GUI to review mutation handlers and SQLite state. Override functions no longer write directly to DB; overrides persist to JSON SSOT and sync through the publisher pipeline.
> **Prerequisites:** [../03-architecture/data-model.md](../03-architecture/data-model.md), [catalog-and-product-selection.md](./catalog-and-product-selection.md)
> **Last validated:** 2026-04-07

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Scalar review page | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | product/field review matrix |
| Component review page | `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` | component and enum review surfaces |
| Review API | `src/features/review/api/reviewRoutes.js` | `/review/*` and `/review-components/*` |
| Scalar mutations | `src/features/review/api/itemMutationRoutes.js` | override, manual-override, key-review confirm, and key-review accept routes |
| Component mutations | `src/features/review/api/componentMutationRoutes.js` | component property/identity override and component shared-lane confirm |
| Enum mutations | `src/features/review/api/enumMutationRoutes.js` | enum accept/remove/rename actions |

## Dependencies

- `src/features/review-curation/index.js`
- `src/features/review/domain/overrideWorkflow.js` - override accept/manual/approve/finalize (no longer writes to DB directly)
- `src/features/review/domain/reviewGridStateRuntime.js` - grid state sync (`syncItemFieldStateFromPrimaryLaneAccept` is now a no-op stub)
- `src/db/specDb.js`
- `src/field-rules/sessionCache.js`
- `src/features/indexing/index.js`
- `tools/gui-react/src/pages/component-review/*.tsx`

## Flow

1. The user opens the review or component-review page.
2. The GUI loads layout and payload endpoints such as `/review/:category/layout`, `/review/:category/products-index`, `/review/:category/candidates/:productId/:fieldKey`, `/review-components/:category/layout`, and `/review-components/:category/components`.
3. `src/features/review/api/reviewRoutes.js` builds the payload from catalog rows, SpecDb slot state, candidate lists, and session-derived field rules.
4. The user accepts a candidate, overrides a value, or runs enum/component review actions.
5. Mutation handlers in `src/features/review/api/itemMutationRoutes.js`, `src/features/review/api/componentMutationRoutes.js`, or `src/features/review/api/enumMutationRoutes.js` write to `component_values`, `list_values`, `candidate_reviews`, and `key_review_*` tables. Override values persist to JSON SSOT only; `item_field_state` DB writes have been removed from the override path.
6. Shared-lane helpers synchronize AI/human review state and may cascade changes into queued products or dependent review rows.
7. The route layer emits `data-change` events so open review tabs refresh.

## Override DB Sync Removal

Direct DB sync has been removed from the core override workflow functions in `src/features/review/domain/overrideWorkflow.js`:

- `setOverrideFromCandidate()` no longer calls `specDb.upsertItemFieldState` / `syncItemListLinkForFieldValue`.
- `setManualOverride()` no longer writes to specDb.
- `approveGreenOverrides()` no longer batch-writes to specDb.
- `finalizeOverrides()` no longer runs transactional DB writes.
- `syncItemFieldStateFromPrimaryLaneAccept()` in `reviewGridStateRuntime.js` is now a no-op stub.

Overrides persist to JSON SSOT only; DB sync is deferred to the publisher pipeline. Grid review UI state (`key_review_state`) still writes to DB normally.

## Side Effects

- Writes key review state (`key_review_state` tables) into SQLite for grid UI state.
- Override values persist to JSON SSOT only; DB field-state sync is handled by the publisher pipeline.
- May write component override JSON under `category_authority/{category}/_overrides/components/`.

## Error Paths

- Product not in catalog or SpecDb: `404 not_in_catalog` / `503 specdb_not_ready`.
- Review consumer disabled for enum consistency: `403 review_consumer_disabled`.
- Unknown review action or missing ids: `400`.
- Suggestion CLI spawn failure: `500 suggest_failed`.

## State Transitions

| Entity | Transition |
|--------|------------|
| Scalar lane | candidate list -> selected candidate -> confirmed/accepted/overridden state |
| Component row | pending review -> accepted alias/new component/dismissed |
| Enum row | pending review -> mapped to existing / kept new / removed / uncertain |
| Key review state | uninitialized -> confirmed/accepted/overridden |

## Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '20px', 'actorWidth': 250, 'actorMargin': 200, 'boxMargin': 20 }}}%%
sequenceDiagram
  autonumber
  box Client
    participant ReviewPage as ReviewPage<br/>(tools/gui-react/src/features/review/components/ReviewPage.tsx)
  end
  box Server
    participant ReviewRoutes as reviewRoutes<br/>(src/features/review/api/reviewRoutes.js)
    participant ItemMut as itemMutationRoutes<br/>(src/features/review/api/itemMutationRoutes.js)
  end
  box Database
    participant SpecDb as SpecDb<br/>(src/db/specDb.js)
  end
  ReviewPage->>ReviewRoutes: GET /api/v1/review/:category/products-index
  ReviewRoutes->>SpecDb: load products, slot state, candidates, key review rows
  ReviewRoutes-->>ReviewPage: review payload
  ReviewPage->>ItemMut: POST override/manual-override/key-review-accept
  ItemMut->>SpecDb: update key_review_* + candidate_reviews (item_field_state writes removed)
  ItemMut-->>ReviewPage: mutation result + data-change refresh
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/review/api/reviewRoutes.js` | Review/read endpoints and mutation handoff |
| source | `src/features/review/api/itemMutationRoutes.js` | Scalar review mutations |
| source | `src/features/review/api/componentMutationRoutes.js` | Component review mutations |
| source | `src/features/review/api/enumMutationRoutes.js` | Enum review mutations |
| source | `src/features/review/domain/overrideWorkflow.js` | Override functions: DB sync removed, JSON SSOT only |
| source | `src/features/review/domain/reviewGridStateRuntime.js` | `syncItemFieldStateFromPrimaryLaneAccept` confirmed as no-op stub |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | Scalar review GUI |
| source | `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` | Component review GUI |

## Related Documents

- [Field Rules Studio](./field-rules-studio.md) - Studio definitions shape review layout and review consumer gates.
- [Data Model](../03-architecture/data-model.md) - Review primarily writes slot, review, and key-review tables.
