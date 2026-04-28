# Billing / Cost / Telemetry Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

LLM cost capture is broadly wired. Active findings are telemetry truncation, missing user-facing warnings, and timer-based billing dashboard freshness.

## Active Findings

### G1. Run-summary telemetry is capped at 6000 events - MEDIUM
**File:** `src/indexlab/runSummarySerializer.js`

Long runs can silently truncate tail telemetry used by funnel/extraction/observability cards.

**Fix shape:** Raise the cap and add an explicit truncation flag, or move large telemetry to a paginated reader.

### G2. Orphaned-event counters are not surfaced - LOW
**File:** `src/indexlab/runSummarySerializer.js`

`run_summary.observability` can carry `llm_orphan_finish` and `llm_missing_telemetry`, but user-facing surfacing is unclear.

**Fix shape:** Show a small telemetry warning when either counter is non-zero.

### G3. Billing dashboard freshness is timer-based - LOW
**File:** `tools/gui-react/src/features/billing/billingQueries.ts`

The dashboard refetches every 30 seconds and does not receive a `billing-updated` event.

**Fix shape:** Emit a billing data-change event from cost-writing or run-finalize paths if users need immediate cost updates.

## Recommended Fix Order

1. **G1** - Add truncation flag or paginated event access.
2. **G2** - Surface telemetry warning counters.
3. **G3** - Add `billing-updated` only if dashboard freshness is a real workflow issue.
