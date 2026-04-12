# Publisher Pipeline — Implementation Roadmap

> **Purpose:** Phased plan for building the auto-publish pipeline that promotes validated candidates to `item_field_state` as the current value, gated by a configurable confidence threshold.
> **Created:** 2026-04-10

---

## Design Principles

1. **Candidates auto-publish on submission.** When `submitCandidate()` accepts a value, it publishes immediately to `item_field_state` — no human accept step.
2. **Manual override is the only review action.** No candidate accept, no AI lanes, no finalize. Simple manual override wins.
3. **Manual override locks the field.** If `item_field_state` has `source = 'manual_override'`, new candidates skip auto-publish for that (product, field).
4. **Confidence threshold gates publishing.** A global knob (`publishConfidenceThreshold`) controls the minimum confidence to auto-publish. Candidates below the threshold stay as candidates but are not published.
5. **Threshold changes trigger reconciliation.** Raising or lowering the threshold re-evaluates all (product, field) pairs — publishing newly-qualifying candidates or unpublishing values that no longer meet the threshold.
6. **Cross-field constraints, evidence, and tier are enforced at publish time.** These checks run after per-field validation and before the `item_field_state` upsert.
7. **Set union for list fields.** When `contract.list_rules.item_union = 'set_union'`, new candidate values are merged into the published list, not replaced.

---

## Phase 0 — Foundation: Knob + Badges

### 0a. Add `publishConfidenceThreshold` to Settings Registry

**File:** `src/shared/settingsRegistry.js`

```js
{
  key: "publishConfidenceThreshold",
  type: "float",
  default: 0.7,
  min: 0,
  max: 1,
  configKey: "publishConfidenceThreshold",
  envKey: "PUBLISH_CONFIDENCE_THRESHOLD",
  group: "validation",
  uiCategory: "validation",
  uiSection: "publisher",
  uiHero: true,
  uiTip: "Minimum candidate confidence to auto-publish to item_field_state. Candidates below this threshold remain unpublished. Changing this value triggers reconciliation across all published values."
}
```

All derived surfaces (defaults, clamps, types) auto-update from registry — zero additional maintenance.

### 0b. Add PUB Badge Group

**File:** `src/field-rules/consumerBadgeRegistry.js`

Add parent group:
```js
pub: { label: 'PUB', title: 'Publisher Pipeline' },
```

Add `pub.*` consumer entries to existing badge paths:

| Path | Consumer Key | Description |
|------|-------------|-------------|
| `evidence.min_evidence_refs` | `pub.gate` | Rejects candidate at publish time if distinct evidence refs fall below threshold. |
| `evidence.tier_preference` | `pub.gate` | Requires at least one evidence ref from a preferred tier before publishing. |
| `evidence.evidence_tier_minimum` | `pub.gate` | Rejects evidence from tiers below the minimum at publish time. |
| `constraints` | `pub.cross` | Enforces cross-field constraint rules (conditional require, mutual exclusion, component DB lookup, group completeness) at publish time. |
| `contract.list_rules` | `pub.union` | Applies set-union merge when `item_union = 'set_union'` — new candidate values are added to the published list rather than replacing it. |

New badge entry for `item_union` (does not exist yet):

| Path | Consumer Key | Description |
|------|-------------|-------------|
| `contract.list_rules.item_union` | `pub.union` | Controls how list-field candidates merge with published values. `set_union` = append unique values to published list. |

### 0c. Add PUB Badge Color to GUI

**File:** `tools/gui-react/src/features/studio/workbench/SystemBadges.tsx`

Add color mapping for `pub` group (suggested: blue/indigo to distinguish from existing palette).

---

## Phase 1 — Core Publish Function

### 1a. `publishCandidate()` — Single Field Publish

**New file:** `src/features/publisher/publish/publishCandidate.js`

```
publishCandidate({ specDb, appDb, category, productId, fieldKey, candidateRow, fieldRules, knownValues, componentDb, config })
  1. Read publishConfidenceThreshold from appDb settings
  2. GATE: candidate.confidence < threshold → return { status: 'below_threshold' }
  3. GATE: check item_field_state for existing manual override
     → if source = 'manual_override' → return { status: 'manual_override_locked' }
  4. Cross-field constraints (from runtimeGate)
     → hard errors → return { status: 'cross_field_rejected', errors }
  5. Evidence gate (from engineEvidenceAuditor)
     → min_evidence_refs check
     → tier_minimum check
     → failure → return { status: 'evidence_rejected', errors }
  6. Set union (if list field with item_union = 'set_union')
     → read current published list from item_field_state
     → merge candidate list values (dedupe)
     → publish the merged list
  7. Upsert item_field_state:
     - value, unit, confidence
     - source: 'pipeline' (or 'manual_override' for overrides)
     - accepted_candidate_id: candidateRow.id
  8. Mark field_candidates.status = 'resolved'
  9. Return { status: 'published', value, candidateId }
```

### 1b. Wire Into `submitCandidate()`

**File:** `src/features/publisher/candidate-gate/submitCandidate.js`

After the existing dual-write (SQL + JSON), call `publishCandidate()` when status is `'accepted'`. This makes auto-publish immediate on candidate submission.

### 1c. Manual Override Publish

**File:** `src/features/publisher/publish/publishManualOverride.js`

When a manual override is set (via review workbench), write directly to `item_field_state` with `source = 'manual_override'`. This bypasses confidence threshold — manual always wins.

### 1d. Unlock (Delete Override)

To unlock a field for auto-publish:
- Delete the `item_field_state` row where `source = 'manual_override'`
- Re-evaluate highest-confidence candidate for that (product, field) and auto-publish if above threshold

---

## Phase 2 — Threshold Reconciliation

### 2a. Reconciliation Function

**New file:** `src/features/publisher/publish/reconcileThreshold.js`

```
reconcileThreshold({ specDb, appDb, category, newThreshold, oldThreshold, fieldRules, ... })
  For each product in category:
    For each field:
      current = item_field_state row (if exists)
      if current.source = 'manual_override' → skip (locked)

      if newThreshold > oldThreshold (TIGHTENING):
        if current exists AND current.confidence < newThreshold:
          → unpublish: delete item_field_state row
          → revert field_candidates.status → 'candidate'
          → yield { action: 'unpublished', productId, fieldKey, confidence }

      if newThreshold < oldThreshold (LOOSENING):
        if no current published value (or was just unpublished):
          → find highest-confidence candidate >= newThreshold
          → if found: publish it
          → yield { action: 'published', productId, fieldKey, confidence }
```

### 2b. Dry-Run / Preview

Before applying, return a summary:
```json
{
  "direction": "tightening",
  "old_threshold": 0.7,
  "new_threshold": 0.85,
  "would_unpublish": 142,
  "would_publish": 0,
  "manual_override_locked": 23,
  "unaffected": 1847,
  "by_field": { "dpi": 3, "weight": 7, ... }
}
```

### 2c. API Endpoint

```
POST /api/v1/publisher/:category/reconcile
Body: { threshold: 0.85, dryRun: true|false }
Response: { preview } or { applied, progress_id }
```

### 2d. Progress Tracking

For non-dry-run reconciliation:
- Emit progress via WebSocket data-change events
- `{ event: 'publisher-reconcile-progress', progress: 42, total: 200, category }`
- GUI renders a progress bar

---

## Phase 3 — Publisher Settings GUI Panel

### 3a. Pipeline Settings: "Review Publisher" Button

**File:** `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`

Add a first-column hero button labeled **"Review Publisher"** in the `validation` uiCategory. Clicking opens a dedicated panel.

### 3b. Publisher Panel

The panel contains:
- **Confidence Threshold** — slider or input (0.0–1.0), current value shown prominently
- **Impact Preview** — when threshold changes, auto-fetch dry-run preview showing:
  - "Would publish X candidates" / "Would unpublish Y values"
  - Breakdown by field key
- **Apply Button** — triggers reconciliation with progress bar
- **Current Stats** — published count, unpublished count, manual override count per category

Open for future knobs (no others needed now, but the panel scaffold supports adding more).

### 3c. Data Change Event

When threshold is saved:
1. Persist to `settings` table via existing `configRuntimeSettingsHandler`
2. Emit `runtime-settings-updated` data-change event (existing)
3. Publisher GUI and pipeline consumers react to the change

---

## Phase 4 — Strip Review Grid Dead Code

### 4a. Backend Removals

| What | File | Action |
|------|------|--------|
| `syncItemFieldStateFromPrimaryLaneAccept()` no-op stub | `reviewGridStateRuntime.js:133-139` | Remove function, remove from exports |
| `key-review-confirm` endpoint | `itemMutationRoutes.js` | Remove handler |
| `key-review-accept` endpoint | `itemMutationRoutes.js` | Remove handler |
| `override` (candidate accept) endpoint | `itemMutationRoutes.js` | Remove handler |
| AI lane state columns in `key_review_state` | `specDbSchema.js` | Leave table for now, stop writing AI columns |
| `finalizeOverrides()` | `overrideWorkflow.js` | Remove function |
| `approveGreenOverrides()` | `overrideWorkflow.js` | Remove function |
| `setOverrideFromCandidate()` | `overrideWorkflow.js` | Remove function (replaced by auto-publish) |

**Keep:** `setManualOverride()` — this is the sole remaining review action, rewired to publish directly.

### 4b. GUI Removals

| What | File | Action |
|------|------|--------|
| `finalizeMut` mutation | `ReviewPage.tsx` | Remove |
| Ctrl+S finalize hotkey | `ReviewPage.tsx` | Remove |
| "Finalize" button | `ReviewPage.tsx` | Remove |
| `overrideMut` (candidate accept) | `ReviewPage.tsx` | Remove |
| `confirmKeyReviewMut` (AI confirm) | `ReviewPage.tsx` | Remove |
| `acceptKeyReviewMut` (user accept AI) | `ReviewPage.tsx` | Remove |
| AI lane status display | `ReviewPage.tsx` | Remove |
| Candidate acceptance UI | `ReviewPage.tsx` | Remove |

**Keep:** Manual override input + button — this becomes the only mutation surface.

### 4c. Test Cleanup

- Remove/update tests for removed endpoints and functions
- Update `reviewMutationRouteBuilders.js` test fixtures
- Update `reviewGridStateRuntime.primary-sync.test.js` (remove no-op stub tests)

---

## Phase Dependencies

```
Phase 0 (Foundation)
  ├── 0a: Settings knob
  ├── 0b: Badge registry (PUB consumers)
  └── 0c: Badge GUI color
         │
Phase 1 (Core Publish) ← depends on Phase 0a
  ├── 1a: publishCandidate() function
  ├── 1b: Wire into submitCandidate()
  ├── 1c: Manual override publish
  └── 1d: Unlock (delete override)
         │
Phase 2 (Reconciliation) ← depends on Phase 1
  ├── 2a: reconcileThreshold() function
  ├── 2b: Dry-run preview
  ├── 2c: API endpoint
  └── 2d: Progress tracking
         │
Phase 3 (GUI Panel) ← depends on Phase 2
  ├── 3a: Pipeline Settings button
  ├── 3b: Publisher panel
  └── 3c: Data change event
         │
Phase 4 (Strip Dead Code) ← independent, can run anytime after Phase 1
  ├── 4a: Backend removals
  ├── 4b: GUI removals
  └── 4c: Test cleanup
```

---

## Key Files (Implementation Targets)

| File | Phase | Change |
|------|-------|--------|
| `src/shared/settingsRegistry.js` | 0a | Add `publishConfidenceThreshold` entry |
| `src/field-rules/consumerBadgeRegistry.js` | 0b | Add `pub` group + consumer entries |
| `tools/gui-react/src/features/studio/workbench/SystemBadges.tsx` | 0c | Add `pub` color |
| `src/features/publisher/publish/publishCandidate.js` | 1a | **New** — core publish logic |
| `src/features/publisher/publish/publishManualOverride.js` | 1c | **New** — manual override publish |
| `src/features/publisher/candidate-gate/submitCandidate.js` | 1b | Wire auto-publish after dual-write |
| `src/db/stores/fieldCandidateStore.js` | 1a | Add `markResolved()` method |
| `src/features/publisher/publish/reconcileThreshold.js` | 2a | **New** — threshold reconciliation |
| `src/features/publisher/api/publisherRoutes.js` | 2c | Add `POST /reconcile` endpoint |
| Pipeline Settings page | 3a-b | Add Review Publisher panel |
| `src/features/review/domain/overrideWorkflow.js` | 4a | Strip dead functions |
| `src/features/review/api/itemMutationRoutes.js` | 4a | Strip dead endpoints |
| `tools/gui-react/src/features/review/components/ReviewPage.tsx` | 4b | Strip dead mutations + UI |

---

## Constraints Matrix (Enforced at Publish Time)

| Constraint | Source | Rejection Type |
|-----------|--------|---------------|
| Confidence threshold | `publishConfidenceThreshold` setting | `below_threshold` |
| Manual override lock | `item_field_state.source = 'manual_override'` | `manual_override_locked` |
| Shape, unit, type, format, enum, range | `validateField()` (existing 12-step) | Hard reject |
| Publish gate (required/identity null) | `validateField()` step 11 | `unk_blocks_publish` |
| Cross-field: conditional require | `cross_validation_rules.json` | Hard reject |
| Cross-field: mutual exclusion | `cross_validation_rules.json` | Hard reject |
| Cross-field: component DB lookup | `cross_validation_rules.json` | Hard reject |
| Cross-field: group completeness | `cross_validation_rules.json` | Warning (no block) |
| Evidence: min refs | `field.evidence.min_evidence_refs` | Hard reject |
| Evidence: tier minimum | `field.evidence.evidence_tier_minimum` | Hard reject |
| Set union merge | `contract.list_rules.item_union` | Merge (no reject) |
