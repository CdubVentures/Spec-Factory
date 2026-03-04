# Drift Findings Priority (2026-02-26)

## Source
- Full generated matrix:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`

## Global Scoreboard
- Total analyzed surfaces: `83`
- Drift grade split:
  - `aligned`: `4`
  - `low`: `14`
  - `moderate`: `38`
  - `high`: `27`

## Section Heat Map
| Section | Total | High | Moderate | Low | Aligned | Avg rawColor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| runtime-ops | 25 | 12 | 10 | 3 | 0 | 63.48 |
| indexing | 22 | 7 | 14 | 1 | 0 | 81.45 |
| studio | 9 | 3 | 5 | 1 | 0 | 168.33 |
| component-review | 5 | 3 | 2 | 0 | 0 | 77.60 |
| test-mode | 1 | 1 | 0 | 0 | 0 | 225.00 |
| catalog | 3 | 1 | 1 | 1 | 0 | 111.33 |
| llm-settings | 1 | 0 | 0 | 0 | 1 | 0.00 |
| storage | 1 | 0 | 0 | 0 | 1 | 0.00 |
| pipeline-settings | 2 | 0 | 0 | 0 | 2 | 2.00 |

## Drift Clusters
### Cluster A: Unmigrated high drift (`sf-*` count = 0)
- Top candidates:
  - `tools/gui-react/src/pages/studio/StudioPage.tsx` (`rawColor=944`)
  - `tools/gui-react/src/pages/catalog/ProductManager.tsx` (`rawColor=310`)
  - `tools/gui-react/src/pages/studio/BrandManager.tsx` (`rawColor=245`)
  - `tools/gui-react/src/pages/test-mode/TestModePage.tsx` (`rawColor=225`)
  - `tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx` (`rawColor=202`)
  - `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx` (`rawColor=121`)
  - `tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx` (`rawColor=96`)
  - `tools/gui-react/src/pages/component-review/EnumSubTab.tsx` (`rawColor=96`)
- Signal:
  - High direct utility-color density with minimal/no primitive abstraction.
  - Radius token spread remains wide in these surfaces (`rounded`, `rounded-full`, `rounded-lg`, `rounded-t`, `rounded-b`).

### Cluster B: Hybrid high drift (high `sf-*` but still high `rawColor`)
- Top candidates:
  - `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` (`sf=79`, `rawColor=466`)
  - `tools/gui-react/src/pages/indexing/panels/Phase05Panel.tsx` (`sf=59`, `rawColor=183`)
  - `tools/gui-react/src/pages/indexing/panels/SearchProfilePanel.tsx` (`sf=83`, `rawColor=179`)
  - `tools/gui-react/src/pages/runtime-ops/panels/QueueTab.tsx` (`sf=11`, `rawColor=131`)
  - runtime-ops `Prefetch*` family (`rawColor 107-128`, `sf 34-60`)
- Signal:
  - Primitive adoption exists, but dense telemetry/status subregions still rely on raw utility colors.
  - Best addressed by replacing inline status/badge/callout maps with semantic primitive variants.

## Immediate Wave Order
1. Wave 10: catalog + studio manager surfaces
   - `tools/gui-react/src/pages/catalog/ProductManager.tsx`
   - `tools/gui-react/src/pages/studio/BrandManager.tsx`
2. Wave 11: component-review + test-mode unmigrated high drift
   - `ComponentReviewDrawer.tsx`, `ComponentReviewPanel.tsx`, `EnumSubTab.tsx`, `TestModePage.tsx`
3. Wave 12: indexing/runtime telemetry hybrid cleanup
   - `RuntimePanel`, `Phase05Panel`, `SearchProfilePanel`, `QueueTab`, runtime-ops `Prefetch*` panels
4. Wave 13: studio core + workbench heavy surfaces
   - `StudioPage.tsx`, `WorkbenchDrawer.tsx`

## Guardrail Recommendation for Next Wave
- Add wave-specific drift guards before each migration batch and keep them red-first.
- Keep enforcing:
  - denylist of legacy inline color bundles
  - constrained radius token palette
  - no arbitrary micro text utility fragments
