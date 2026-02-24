# Parsing Bundle 01-06 - Core Text and Document Surfaces

## Canonical Status
- Consolidated on 2026-02-24 from parsing docs `01` through `06`.
- This file is the canonical parsing plan for core surfaces.

## Status Matrix
| Parsing Phase | Status | Audit Result |
|---|---|---|
| 01 Static HTML | complete | Static DOM extraction, table/dl parsing, and identity gating are implemented. |
| 02 Dynamic JS | complete | Dynamic fetch policy, retry controls, and runtime knobs are implemented. |
| 03 Article extraction | complete | Readability fallback policy and runtime telemetry are implemented. |
| 04 HTML tables | complete | Table parser v2, normalization, and adapter wiring are implemented. |
| 05 Structured metadata | complete | Sidecar extraction and merger lane are implemented. |
| 06 Text PDF | complete | Backend routing and normalized pdf surfaces are implemented. |

## Implemented Highlights
- Static/dynamic HTML extraction path with runtime controls.
- Main article extraction with quality scoring.
- Table parser v2 with normalization and stronger metadata.
- Structured metadata sidecar integration.
- Text PDF backend router with kv/table surface split.

## Remaining Work
- No blocking implementation gaps were found in phases 01-06 during this audit.

## Superseded Files
- `01-static-html-parsing.md`
- `02-dynamic-js-rendered-parsing.md`
- `03-main-article-extraction.md`
- `04-html-spec-table-extraction.md`
- `05-embedded-json-structured-metadata.md`
- `06-text-pdf-extraction.md`
