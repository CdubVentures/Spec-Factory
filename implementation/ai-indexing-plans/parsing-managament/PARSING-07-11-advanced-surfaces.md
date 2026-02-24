# Parsing Bundle 07-11 - Advanced and Visual Surfaces

## Canonical Status
- Consolidated on 2026-02-24 from parsing docs `07` through `11`.
- This file is the canonical parsing plan for advanced surfaces.

## Audit Evidence
- Source inspection across parsing, runtime bridge, and GUI event surfaces.
- Confirmed runtime ocr counters and backend controls exist.

## Status Matrix
| Parsing Phase | Status | Audit Result |
|---|---|---|
| 07 Scanned PDF OCR | partial | Baseline OCR flow is present; preprocess quality pipeline is still missing. |
| 08 Image OCR | not implemented | No worker pipeline exists that consumes visual assets and emits OCR candidates. |
| 09 Chart/graph extraction | partial | Network payload intercept exists; full ordered extraction stack is missing. |
| 10 Mixed office docs | not implemented | No unified DOCX/XLSX/PPTX ingestion router exists. |
| 11 Visual asset capture | partial | Screenshot capture exists; dedicated capture control plane is incomplete. |

## Implemented Baseline
- Scanned PDF OCR counters, backend selection, and runtime visibility.
- Screenshot capture queue and visual capture event emission.
- Phase classification packets include `phase_08_image_ocr` placeholders.

## Remaining Implementation
1. Parsing 07:
  - Add OCR preprocess stages (deskew, denoise, binarize).
  - Add fixture accuracy suite for preprocess impact.
2. Parsing 08:
  - Implement image OCR worker pipeline.
  - Consume Phase 08B/11 asset manifests and emit region-level evidence rows.
3. Parsing 09:
  - Complete ordered chart extraction stack:
    - network payload parse
    - config object parse
    - svg data extraction
    - vision fallback
4. Parsing 10:
  - Implement mixed-doc router for DOCX/XLSX/PPTX.
5. Parsing 11:
  - Add visual capture control plane:
    - per-source policy
    - max-per-source budget
    - lifecycle events and policy enforcement

## Superseded Files
- `07-scanned-pdf-ocr.md`
- `08-image-ocr-extraction.md`
- `09-chart-graph-extraction.md`
- `10-office-mixed-doc-ingestion.md`
- `11-visual-asset-capture.md`
