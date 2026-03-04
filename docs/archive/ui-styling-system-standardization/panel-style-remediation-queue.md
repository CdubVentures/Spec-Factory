# Panel Style Remediation Queue

Generated: 2026-03-03
Snapshot: implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json

## Queue Contract

- Prioritize by `driftGrade` then `rawColor` density.
- Keep edits semantic (`sf-*` primitives and semantic token aliases only).
- Lock every migrated slice with a targeted drift guard assertion.

## Snapshot Summary

| Total surfaces | Aligned | Low drift | Moderate drift | High drift |
| --- | --- | --- | --- | --- |
| 83 | 83 | 0 | 0 | 0 |

## Section Heat Ranking

| Section | High | Moderate | Low | Aligned | Raw color refs | Unique raw colors |
| --- | --- | --- | --- | --- | --- | --- |
| pipeline-settings | 0 | 0 | 0 | 2 | 2 | 2 |
| studio | 0 | 0 | 0 | 9 | 2 | 1 |
| billing | 0 | 0 | 0 | 1 | 0 | 0 |
| catalog | 0 | 0 | 0 | 3 | 0 | 0 |
| component-review | 0 | 0 | 0 | 5 | 0 | 0 |
| indexing | 0 | 0 | 0 | 22 | 0 | 0 |
| llm-settings | 0 | 0 | 0 | 1 | 0 | 0 |
| overview | 0 | 0 | 0 | 1 | 0 | 0 |
| product | 0 | 0 | 0 | 5 | 0 | 0 |
| review | 0 | 0 | 0 | 4 | 0 | 0 |
| runtime | 0 | 0 | 0 | 3 | 0 | 0 |
| runtime-ops | 0 | 0 | 0 | 25 | 0 | 0 |
| storage | 0 | 0 | 0 | 1 | 0 | 0 |
| test-mode | 0 | 0 | 0 | 1 | 0 | 0 |

## Wave Summary

| Wave | Surfaces | High | Moderate | Low | Raw color refs | Unique raw colors |
| --- | --- | --- | --- | --- | --- | --- |

## Ranked Remediation Queue

| Rank | Surface | Section | Grade | Raw color refs | Unique raw colors | `sf-*` refs | Radius tokens | Suggested wave | Complexity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Notes

- `wave-1` favors high-drift files already rich in `sf-*` usage for low-risk, high-yield cleanup.
- `wave-2` targets the remaining high-drift set plus higher-density moderate files.
- `wave-3/4` covers moderate and low residuals after high-drift burn down.

