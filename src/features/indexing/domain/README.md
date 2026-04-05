## Purpose

Own indexing domain logic: product history metrics, run funnel summaries, domain/site-kind classification, fetch-outcome tracking, host-budget scoring, and round summary construction from IndexLab event logs.

## Public API (The Contract)

- `computeProductHistoryMetrics.js` -- product history metric computation
- `extractRunFunnelSummary.js` -- run funnel summary extraction
- `domainBucketHelpers.js` -- `createDomainBucket`, `createUrlStat`, `inferSiteKindByDomain`, `classifySiteKind`, `classifyFetchOutcomeFromEvent`, site-kind constants (`SITE_KIND_RANK`), fetch-outcome tracking
- `roundSummary.js` -- `buildRoundSummaryFromEvents`

## Dependencies

- Allowed: `src/shared/*`, `src/core/*`
- Forbidden: `src/features/*/` internals (other features), `src/db/`, `src/app/`

## Domain Invariants

- Site-kind classification uses `SITE_KIND_RANK` ordering (manufacturer > review > database > retailer > community > aggregator > other).
- Fetch outcomes are classified from raw event data, never hardcoded per-domain.
- Round summaries are derived purely from event arrays -- no DB access.
