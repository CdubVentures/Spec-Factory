# Archetype Query Planner Validation - Pass 1 Live 3 Mice

> **Purpose:** Preserve the historical live-validation record for the initial archetype-query-planner three-model mouse pass.
> **Prerequisites:** [../README.md](../README.md), [../04-features/indexing-lab.md](../04-features/indexing-lab.md)
> **Last validated:** 2026-03-17

Historical note: this file records one targeted validation pass. Its full-suite counts do not represent the current global baseline of the repo after later work.

## Validation Result

Status: `PASS WITH ISSUES`

Summary:

- The archetype query planner produced correct output for all three live mouse models used in the pass.
- Targeted planner/query tests passed.
- Source-class diversity, field-stuffing elimination, and support-domain spam elimination were confirmed.
- Two non-blocking issues were documented:
  - the full pipeline CLI run hung during initialization, which blocked direct S3 persistence validation;
  - `PrefetchSearchProfilePanel.tsx` had a pre-existing TypeScript error unrelated to the planner logic under validation.

## Scope

Validated:

- `src/features/indexing/search/archetypeQueryPlanner.js`
- `src/features/indexing/search/queryBuilder.js`
- `test/archetypeQueryPlanner.test.js`
- `test/queryBuilderCharacterization.test.js`
- `test/phase02SearchProfile.test.js`
- `test/queryBuilder.test.js`
- `test/discoveryQueryPlan.test.js`
- live NeedSet -> Brand Resolver -> Search Profile flow for three mouse products
- schema continuity across those stages
- query quality against the prior field-first behavior

Not validated:

- post-archetype learning-loop hardening
- broader lexicon redesign
- direct S3 persistence, because the CLI run hung before end-to-end validation

## Historical Environment Snapshot

| Field | Value |
|-------|-------|
| date | `2026-03-16` |
| platform | Windows 11 Pro |
| local input root | `fixtures/s3` |
| local output root | `C:\Users\Chris\AppData\Local\Temp\spec-factory\output` |
| S3 bucket configured | `my-spec-harvester-data` |
| source registry snapshot | `22` sources, `31` hosts, `80` fields |

## Seed Models

| Product ID | Brand | Model | Validation intent |
|------------|-------|-------|-------------------|
| `mouse-razer-viper-v3-pro` | Razer | Viper V3 Pro | flagship wireless / mainstream review coverage |
| `mouse-endgame-gear-xm1r` | Endgame Gear | XM1r | wired / lighter source footprint |
| `mouse-cooler-master-mm712-30th-anniversary-edition` | Cooler Master | MM712 30th Anniversary Edition | variant-heavy / manual-support-heavy |

## Proof Summary

| Proof | Result |
|-------|--------|
| targeted planner/query tests | `104/104` pass |
| local three-model runs | all three passed NeedSet, Brand Resolver, and Search Profile stages |
| local artifacts | written to `tools/validation-output/` |
| full suite at that time | historical audit recorded `3894 pass`, `179 fail`, all failures documented as pre-existing and unrelated to the planner |

## Key Verified Outcomes

| Area | Historical result |
|------|-------------------|
| schema continuity | identity and unresolved-field counts remained aligned from NeedSet through Search Profile |
| diversity | all runs produced manufacturer, lab-review, spec-database, aggregator, base-template, learned, and hard-field query classes |
| spam regression | support-domain spam removed |
| query quality | zero field-stuffed queries reported in the pass |
| output contract | additive fields such as `archetype_summary`, `coverage_analysis`, and `_meta` were introduced without removing prior fields |

## Historical Limits

| Limit | Impact |
|-------|--------|
| CLI pipeline hang | blocked direct end-to-end S3 persistence validation |
| GUI TypeScript error in `PrefetchSearchProfilePanel.tsx` | unrelated GUI issue remained open during the pass |
| retailer/community gates | noted as future-tuning work, not pass/fail blockers |

## Recommendation Recorded By The Pass

Proceed to the next hardening phase (`v3.1` in the historical plan), because the targeted planner work met its success criteria even though broader pipeline/runtime issues remained outside scope.

## Artifact Paths

| Artifact | Path |
|----------|------|
| validation output | `tools/validation-output/mouse-razer-viper-v3-pro.json` |
| validation output | `tools/validation-output/mouse-endgame-gear-xm1r.json` |
| validation output | `tools/validation-output/mouse-cooler-master-mm712-30th-anniversary-edition.json` |
| comparison artifact | `fixtures/s3/specs/inputs/_discovery/mouse/20260316202112-738521.search_profile.json` |

## Current Relevance

- Use this file for historical planner-validation context and artifact references.
- Do not use its full-suite counts as the current repo baseline; the current baseline lives in [documentation-audit-ledger.md](./documentation-audit-ledger.md) and [../05-operations/known-issues.md](../05-operations/known-issues.md).

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/indexing/search/archetypeQueryPlanner.js` | planner implementation targeted by the validation pass |
| source | `src/features/indexing/search/queryBuilder.js` | downstream archetype integration targeted by the validation pass |
| test | `test/archetypeQueryPlanner.test.js` | targeted planner proof cited by the audit |
| test | `test/discoveryQueryPlan.test.js` | targeted discovery-plan proof cited by the audit |
| source | `tools/validate-archetype-planner.mjs` | standalone validation harness described by the historical pass |

## Related Documents

- [../04-features/indexing-lab.md](../04-features/indexing-lab.md) - current-state IndexLab flow that this historical validation exercised.
- [../05-operations/known-issues.md](../05-operations/known-issues.md) - current known issues, including present-day runtime/config drift outside this historical pass.
- [./documentation-audit-ledger.md](./documentation-audit-ledger.md) - current documentation audit ledger for this maintained docs tree.
