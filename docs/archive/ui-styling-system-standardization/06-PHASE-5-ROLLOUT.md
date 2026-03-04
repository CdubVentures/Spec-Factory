# Phase 5 - Rollout by Surface

## Objective
Migrate the broader frontend in controlled batches so consistency improves steadily without destabilizing active development.

## How I will execute
1. Prioritize migration by usage frequency and churn.
2. Roll out in bounded batches with verification after each batch.
3. Track adoption metrics and unresolved exceptions.

## Rollout order
1. Shared/common components (`src/components/common`)
2. Global layout shell and navigation (`src/components/layout`)
3. High-change pages (`src/pages/indexing`, `src/pages/runtime-ops`, `src/pages/studio`)
4. Remaining pages and low-traffic surfaces

## Detailed steps
1. Build a migration tracker table with:
1. File path
2. Current drift severity
3. Target primitive/token mapping
4. Status (`pending`, `in-progress`, `done`, `exception`)
2. For each batch:
1. Replace hardcoded class patterns with primitives/tokens.
2. Remove obsolete ad-hoc combinations where possible.
3. Keep logic untouched and minimize behavioral risk.
3. After each batch, run:
1. Build check
2. Focused manual checks for impacted routes
3. Drift count refresh (same commands from Phase 0)
4. Update tracker and exception log.

## Deliverables
1. `rollout-tracker.md`
2. Incremental migration PRs or commits grouped by surface
3. Updated drift metrics after each batch

## Exit criteria
1. Major surfaces use tokenized styles/primitives.
2. Remaining exceptions are explicit and justified.
3. Drift metrics show strong reduction versus Phase 0 baseline.

## Risks and mitigation
1. Risk: long-lived rollout creates mixed style states.
Mitigation: migrate by complete surface, not random file picks.
2. Risk: conflicts with parallel feature work.
Mitigation: coordinate by path ownership and smaller mergeable batches.

