# Phase 04 Risk Register

## R1 - Settings Contract Drift During Consumer Rewire

- Risk: route consumers mix feature entrypoint and legacy deep imports.
- Impact: inconsistent authority behavior and partial migration.
- Mitigation: enforce consumer rewire assertions with dedicated wiring test and targeted settings suites.

## R2 - Compatibility Facade Regression

- Risk: legacy module paths lose exports while downstream callers still depend on them.
- Impact: runtime import failures and broad regression noise.
- Mitigation: keep legacy module exports unchanged while introducing feature entrypoint.

## R3 - Catalog/Review Slice Scope Expansion

- Risk: Wave A catalog or review slices pull in high-coupling orchestration concerns.
- Impact: delays and unstable extraction sequencing.
- Mitigation: keep Wave A to contract-seed and consumer-cutover scope; defer deep orchestration splits to Phase 05.

## R4 - Test Coverage Gaps

- Risk: rewires land without sufficient characterization around settings propagation and review/catalog contracts.
- Impact: regressions surface late in downstream phases.
- Mitigation: per-slice focused test matrix in `05-CHARACTERIZATION-TEST-PLAN.md` and mandatory full `npm test` before report.

## Exception Log

Use this format:

- Date:
- Seam or rule exception:
- Owner:
- Legacy path:
- Replacement contract:
- Expiry phase:
- Tests run:
- Rollback or cleanup task:
