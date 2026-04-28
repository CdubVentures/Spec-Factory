# H14 Skeleton Visual Rework - Next Team Prompt

Copy this prompt into a fresh Codex/frontend team session.

```text
You are taking over H14 in Spec Factory.

Repo root:
C:\Users\Chris\Desktop\Spec Factory

Primary handoff docs:
- docs/audits/auditor-2-frontend-ux.md
- docs/implementation/h14-skeleton-visual-rework/PROMPT.md

Critical context:
- H14 is NOT done.
- The previous pass replaced many centered spinners with skeleton components and structural tests.
- User feedback rejected the visual result: many skeletons look like thin shimmer slivers instead of the exact GUI shapes that load.
- Treat the current 28/28 skeleton tests as structural smoke coverage only. They do not prove visual acceptance.
- Your job is to make the loading states visually match the loaded UI shells and partials.

Non-negotiable goal:
Every major loading state should preserve the same visible layout as the loaded state:
- same outer page/shell geometry
- same tabs/toolbars/filters/actions placement
- same table header, row height, column widths, footer/pagination where present
- same card height and internal mass
- same drawer/modal/sidebar width and section rhythm
- no centered full-page/full-panel spinners
- no tiny shimmer bars floating in otherwise empty containers

Start by reading:
1. docs/audits/auditor-2-frontend-ux.md
2. The section titled "H14 Skeleton Handoff - Visual Rework Required"
3. The skeleton inventory table in that section

Files/surfaces to inspect and rework:
- tools/gui-react/src/features/catalog/components/ProductManagerSkeleton.tsx
- tools/gui-react/src/pages/overview/OverviewPageSkeleton.tsx
- tools/gui-react/src/pages/unit-registry/UnitRegistryPageSkeleton.tsx
- tools/gui-react/src/features/studio/components/BrandManagerSkeleton.tsx
- tools/gui-react/src/pages/publisher/PublisherTableSkeleton.tsx
- tools/gui-react/src/features/storage-manager/components/StorageLoadingSkeleton.tsx
- tools/gui-react/src/features/studio/components/StudioPageSkeleton.tsx
- tools/gui-react/src/pages/component-review/ComponentReviewPageSkeleton.tsx
- tools/gui-react/src/features/review/components/ReviewPageSkeleton.tsx
- tools/gui-react/src/features/color-registry/components/ColorRegistryPageSkeleton.tsx
- tools/gui-react/src/features/runtime-ops/components/RuntimeOpsLoadingSkeleton.tsx
- tools/gui-react/src/pages/layout/AppShellLoadingSkeleton.tsx
- tools/gui-react/src/shared/ui/feedback/SettingsPanelLoadingSkeleton.tsx
- tools/gui-react/src/shared/ui/finder/FinderContentLoadingSkeleton.tsx
- tools/gui-react/src/features/indexing/panels/ProductHistoryLoadingSkeleton.tsx
- tools/gui-react/src/features/indexing/panels/PickerLoadingSkeleton.tsx
- tools/gui-react/src/features/indexing/panels/FinderPanelSkeleton.tsx
- tools/gui-react/src/shared/ui/finder/PromptPreviewModal.tsx

Wiring points to inspect:
- tools/gui-react/src/App.tsx
- tools/gui-react/src/pages/layout/AppShell.tsx
- tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx
- tools/gui-react/src/features/llm-config/sections/LlmGlobalSection.tsx
- tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx
- tools/gui-react/src/features/pipeline-settings/components/CategoryPanel.tsx
- tools/gui-react/src/features/indexing/components/IndexingPage.tsx
- tools/gui-react/src/features/indexing/panels/PickerPanel.tsx
- tools/gui-react/src/features/indexing/panels/ProductHistoryPanel.tsx
- tools/gui-react/src/features/indexing/panels/ProductHistoryKpiRow.tsx
- tools/gui-react/src/shared/ui/finder/GenericScalarFinderPanel.tsx
- tools/gui-react/src/features/product-image-finder/components/ProductImageFinderPanel.tsx
- tools/gui-react/src/features/color-edition-finder/components/ColorEditionFinderPanel.tsx

Tests that currently cover structure:
- tools/gui-react/src/features/catalog/components/__tests__/ProductManagerSkeleton.test.js
- tools/gui-react/src/pages/overview/__tests__/OverviewPageSkeleton.test.js
- tools/gui-react/src/pages/unit-registry/__tests__/UnitRegistryPageSkeleton.test.js
- tools/gui-react/src/features/studio/components/__tests__/BrandManagerSkeleton.test.js
- tools/gui-react/src/pages/publisher/__tests__/PublisherTableSkeleton.test.js
- tools/gui-react/src/features/storage-manager/components/__tests__/StorageLoadingSkeleton.test.js
- tools/gui-react/src/features/studio/components/__tests__/StudioPageSkeleton.test.js
- tools/gui-react/src/pages/component-review/__tests__/ComponentReviewPageSkeleton.test.js
- tools/gui-react/src/features/review/components/__tests__/ReviewPageSkeleton.test.js
- tools/gui-react/src/features/color-registry/components/__tests__/ColorRegistryPageSkeleton.test.js
- tools/gui-react/src/features/runtime-ops/components/__tests__/RuntimeOpsLoadingSkeleton.test.js
- tools/gui-react/src/pages/layout/__tests__/AppShellLoadingSkeleton.test.js
- tools/gui-react/src/pages/layout/__tests__/AppRouteFallbackSkeleton.test.js
- tools/gui-react/src/shared/ui/feedback/__tests__/SettingsPanelLoadingSkeleton.test.js
- tools/gui-react/src/shared/ui/finder/__tests__/FinderContentLoadingSkeleton.test.js
- tools/gui-react/src/features/indexing/panels/__tests__/ProductHistoryLoadingSkeleton.test.js
- tools/gui-react/src/features/indexing/panels/__tests__/PickerLoadingSkeleton.test.js
- tools/gui-react/src/features/indexing/panels/__tests__/FinderPanelSkeleton.test.js
- tools/gui-react/src/shared/ui/finder/__tests__/PromptPreviewLoadingSkeleton.test.js

Process:
1. Run the structural tests to confirm your baseline.
2. Start the GUI in a normal developer PowerShell, not the Codex Windows sandbox, if screenshot capture is needed.
3. Capture loaded-state screenshots for each surface.
4. Force or simulate the matching loading state and capture loading-state screenshots at the same viewport.
5. Rework skeleton dimensions and internal blocks until the broad shape matches.
6. Keep or update structural tests so they protect the improved geometry.
7. Update docs/audits/auditor-2-frontend-ux.md with screenshot proof and exact remaining scope.

Suggested baseline command:
node --test --test-isolation=none tools/gui-react/src/features/storage-manager/components/__tests__/StorageLoadingSkeleton.test.js tools/gui-react/src/pages/publisher/__tests__/PublisherTableSkeleton.test.js tools/gui-react/src/pages/component-review/__tests__/ComponentReviewPageSkeleton.test.js tools/gui-react/src/features/studio/components/__tests__/BrandManagerSkeleton.test.js tools/gui-react/src/features/studio/components/__tests__/StudioPageSkeleton.test.js tools/gui-react/src/pages/unit-registry/__tests__/UnitRegistryPageSkeleton.test.js tools/gui-react/src/pages/overview/__tests__/OverviewPageSkeleton.test.js tools/gui-react/src/features/review/components/__tests__/ReviewPageSkeleton.test.js tools/gui-react/src/features/color-registry/components/__tests__/ColorRegistryPageSkeleton.test.js tools/gui-react/src/features/runtime-ops/components/__tests__/RuntimeOpsLoadingSkeleton.test.js tools/gui-react/src/pages/layout/__tests__/AppShellLoadingSkeleton.test.js tools/gui-react/src/pages/layout/__tests__/AppRouteFallbackSkeleton.test.js tools/gui-react/src/shared/ui/feedback/__tests__/SettingsPanelLoadingSkeleton.test.js tools/gui-react/src/shared/ui/finder/__tests__/FinderContentLoadingSkeleton.test.js tools/gui-react/src/features/indexing/panels/__tests__/ProductHistoryLoadingSkeleton.test.js tools/gui-react/src/features/indexing/panels/__tests__/PickerLoadingSkeleton.test.js tools/gui-react/src/features/indexing/panels/__tests__/FinderPanelSkeleton.test.js tools/gui-react/src/shared/ui/finder/__tests__/PromptPreviewLoadingSkeleton.test.js

Important repo rules:
- Read AGENTS.md first.
- Do not edit CLAUDE.MD.
- Use semantic design tokens and existing primitives.
- Do not add new packages.
- GUI frontend is TypeScript + React. No any, no @ts-ignore, no @ts-nocheck.
- Do not use passing unit tests as visual proof.
- GUI proof is required before marking H14 done.

Known environment note:
- `npm run gui:build` and Playwright screenshot capture may fail in the Codex Windows sandbox with `spawn EPERM`.
- For screenshot proof, use a normal developer PowerShell/browser outside the sandbox.

Acceptance checklist before closing H14:
- Every inventory surface has loaded and loading screenshots.
- Loading screenshots match broad loaded geometry.
- User complaint about "slivers" is addressed directly.
- Structural skeleton tests pass.
- Full relevant GUI smoke/check passes or sandbox limitation is documented.
- docs/audits/auditor-2-frontend-ux.md is updated with proof.
```
