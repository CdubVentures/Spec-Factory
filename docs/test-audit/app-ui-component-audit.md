# App UI Component Test Audit Log

> **Purpose:** Canonical audit log for UI/component test retirement and consolidation work in `tools/gui-react/src`.
> **Last validated:** 2026-03-25

## Scope

- `tools/gui-react/src/features/review/__tests__/reviewLaneGuiContracts.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeIdxBadgeStrip.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListActiveFallbackLabel.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListIdentityFallbackLabel.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListLoadingStatus.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListQueryScope.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js`
- `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsWorkerSelectionPersistence.test.js`
- `tools/gui-react/src/features/runtime-ops/panels/overview/__tests__/runtimeOpsBrowserContracts.test.js`
- `tools/gui-react/src/features/runtime-ops/panels/prefetch/__tests__/runtimeOpsLiveSettingsPanelContracts.test.js`
- `tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js`
- `tools/gui-react/src/features/studio/workbench/__tests__/workbenchDrawerTabContentContracts.test.js`
- `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`
- `tools/gui-react/src/pages/storage/__tests__/storageSettingsPageContract.test.js`

## File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/gui-react/src/features/review/__tests__/reviewLaneGuiContracts.test.js` | KEEP | Protects real lane-scoped review workflows across grid, enum, and component surfaces. The test itself was brittle because it depended on ancestor/XPath card selectors, so it was hardened to use stable candidate action hooks instead. | In-place selector hardening supported by `tools/gui-react/src/shared/ui/overlay/CellDrawer.tsx` stable `data-review-action` and `data-candidate-id` hooks. | Full direct run blocked on 2026-03-25 by local `better-sqlite3` Node ABI mismatch (`NODE_MODULE_VERSION 127` vs required `137`). Narrow selector-hook proof green via direct `CellDrawer` render on 2026-03-25. | Kept, rewritten; partially proven in this environment. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeIdxBadgeStrip.test.js` | KEEP | Protects the user-visible IDX runtime badge strip surface: label presence, visible badge labels, and empty-state suppression. | No replacement required. | Direct `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeIdxBadgeStrip.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js` | KEEP | Stronger page-level contract replacing several tiny harness files with one behavior-focused proof of fallback-row synthesis, category-scoped run loading, and run-scoped worker persistence. | New consolidated contract file. | Direct `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js` green on 2026-03-25. | Added. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListActiveFallbackLabel.test.js` | COLLAPSE | Only covered one slice of the page fallback-row behavior through a dedicated harness file. The behavior is better protected when asserted together with loading state and page scoping. | Replaced by `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`. | Direct consolidated proof green on 2026-03-25. | Deleted. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListIdentityFallbackLabel.test.js` | RETIRE | Duplicated the picker-level identity de-duplication contract already covered directly by `runtimeOpsRunPickerContract.test.js`. Keeping the page-harness copy only repeated the same proof through a more indirect path. | Existing coverage remains in `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js`. | Direct `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js` green on 2026-03-25. | Deleted. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListLoadingStatus.test.js` | COLLAPSE | Tested the same page fallback slice as the active-row harness but split across another tiny file. | Replaced by `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`. | Direct consolidated proof green on 2026-03-25. | Deleted. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListQueryScope.test.js` | COLLAPSE | Protected a real page contract, but as a one-off harness file. It is now covered in the consolidated page contract file alongside the related fallback-row behavior. | Replaced by `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`. | Direct consolidated proof green on 2026-03-25. | Deleted. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js` | KEEP | Protects the visible run-picker contract directly: readable labels, loading copy, category de-duplication, and storage badges. | No replacement required. | Direct `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsWorkerSelectionPersistence.test.js` | COLLAPSE | Protected a real page contract, but in another dedicated one-test file against the same page module. | Replaced by `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`. | Direct consolidated proof green on 2026-03-25. | Deleted. |
| `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js` | COLLAPSE | The old file duplicated page-registry order and border-class styling instead of protecting real nav behavior. The rewritten file now proves active-route accessibility and disabled-tab rendering for all-category and test-mode states. | Replaced the old CSS/order assertions in-place with behavior-focused nav contracts. | Direct `node tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js` green on 2026-03-25. | Kept, rewritten. |
| `tools/gui-react/src/pages/storage/__tests__/storageSettingsPageContract.test.js` | KEEP | Protects the user-visible storage page gate: autosave and manual save stay disabled until shared storage readiness has hydrated. | No replacement required. | Direct `node tools/gui-react/src/pages/storage/__tests__/storageSettingsPageContract.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js` | KEEP | Protects the Studio page's rendered panel-routing behavior, including the known-values warning banner and tab-to-panel isolation. | No replacement required. | Direct `node tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/studio/workbench/__tests__/workbenchDrawerTabContentContracts.test.js` | KEEP | Protects the drawer tab routing surface and the feature-specific props that each rendered tab receives. | No replacement required. | Direct `node tools/gui-react/src/features/studio/workbench/__tests__/workbenchDrawerTabContentContracts.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/panels/overview/__tests__/runtimeOpsBrowserContracts.test.js` | KEEP | Protects the browser-stream empty-state copy and the selected-worker BrowserStream prop contract, both visible runtime-ops behaviors. | No replacement required. | Direct `node tools/gui-react/src/features/runtime-ops/panels/overview/__tests__/runtimeOpsBrowserContracts.test.js` green on 2026-03-25. | Kept unchanged. |
| `tools/gui-react/src/features/runtime-ops/panels/prefetch/__tests__/runtimeOpsLiveSettingsPanelContracts.test.js` | KEEP | Protects live-setting badge visibility in planner and triage empty states after settings hydration. That is a visible runtime surface, not implementation wiring. | No replacement required. | Direct `node tools/gui-react/src/features/runtime-ops/panels/prefetch/__tests__/runtimeOpsLiveSettingsPanelContracts.test.js` green on 2026-03-25. | Kept unchanged. |

## Proof Stack

- `node tools/gui-react/src/features/review/__tests__/reviewLaneGuiContracts.test.js`
- Result: blocked on 2026-03-25 by local `better-sqlite3` Node ABI mismatch with Node `v24.13.1`.
- `node -` inline `CellDrawer` selector-hook proof
- Result: green on 2026-03-25; verified `data-review-action` and `data-candidate-id` hooks render for primary accept/confirm actions.
- `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsPageContracts.test.js`
- Result: green, 3/3 passing on 2026-03-25.
- `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunPickerContract.test.js`
- Result: green, 6/6 passing on 2026-03-25.
- `node tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeIdxBadgeStrip.test.js`
- Result: green, 2/2 passing on 2026-03-25.
- `node tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`
- Result: green, 3/3 passing on 2026-03-25.
- `node tools/gui-react/src/pages/storage/__tests__/storageSettingsPageContract.test.js`
- Result: green, 2/2 passing on 2026-03-25.
- `node tools/gui-react/src/features/studio/components/__tests__/studioPageActivePanelContracts.test.js`
- Result: green, 3/3 passing on 2026-03-25.
- `node tools/gui-react/src/features/studio/workbench/__tests__/workbenchDrawerTabContentContracts.test.js`
- Result: green, 3/3 passing on 2026-03-25.
- `node tools/gui-react/src/features/runtime-ops/panels/overview/__tests__/runtimeOpsBrowserContracts.test.js`
- Result: green, 2/2 passing on 2026-03-25.
- `node tools/gui-react/src/features/runtime-ops/panels/prefetch/__tests__/runtimeOpsLiveSettingsPanelContracts.test.js`
- Result: green, 1/1 passing on 2026-03-25.
- Note: `node --test ...` is sandbox-blocked in this environment with `spawn EPERM`, so targeted proof used direct file execution instead.
