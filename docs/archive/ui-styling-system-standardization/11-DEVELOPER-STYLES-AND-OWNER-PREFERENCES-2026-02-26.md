# Developer Styles and Owner Preferences (2026-02-26)

## Purpose
- Capture owner-specific UI behavior decisions from the 2026-02-26 session.
- Give any incoming developer a clear build contract for new tabs and preset-driven surfaces.
- Keep future theme work easy by enforcing semantic token usage instead of ad-hoc color logic.

## Session Decisions (Must Preserve)
1. Active state must win over hover.
2. Active rows/buttons must keep their selected background while hovered.
3. Review LLM preset color is effort-driven (not always blue, not required-level-driven when showing effort intent).
4. Effort `9-10` must render danger/red.
5. Effort `4-6` must render info/blue (not red).
6. Search Profile Phase 02 header should not show decorative badges.
7. Indexing Lab no longer owns or embeds the runtime settings container.

## Interaction State Contract (Non-Negotiable)
1. For selectable rows (`preset`, `tab-like`, `nav-like`):
- `inactive`: neutral surface.
- `inactive:hover`: subtle emphasis only.
- `selected`: semantic tone based on mapped meaning.
- `selected:hover`: same semantic tone as selected. No reset to neutral/white/default accent.
2. If primitive hover styles override selected tone, selected state must be pinned with stronger selectors or inline semantic token style.
3. Selected state should be legible by background + border + text, not ring-only.

## Effort Color Contract
- Use effort colors only when the UI element communicates effort/intensity/priority.
- Derive effort band from numeric effort value at render/update time.
- Do not trust stale persisted `effort_band` as the rendering source of truth.

Effort band mapping:
1. `1-3` -> `success`
2. `4-6` -> `info`
3. `7-8` -> `warning`
4. `9-10` -> `danger`

Current Review LLM reference surface:
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`

## New Tab Build Checklist
1. Use shared primitives from `tools/gui-react/src/theme.css` (`sf-*` classes).
2. Keep color decisions semantic (`sf-chip-*`, `sf-callout-*`, status text tokens), not raw utility color bundles.
3. Define explicit selected/hover behavior for selectable rows before implementation.
4. If a tab has effort semantics, implement the shared effort-band helper pattern and reuse the canonical mapping.
5. Avoid decorative badges in headers unless they carry actionable state.
6. Add/extend wiring tests for:
- effort-band mapping
- selected-vs-hover stability
- no regression to legacy inline color bundles

## Guardrail Tests To Keep Updated
- `test/settingsAdjacentThemeDriftGuard.test.js`
- `test/llmSettingsEffortBadgeTierWiring.test.js`
- `test/llmSettingsInitialBootstrapWiring.test.js`
- surface-specific drift guards for the tab being changed

## Theme Expansion Rule (For Future Multi-Theme Work)
1. Components map state to semantic roles (`success/info/warning/danger/neutral/accent`), never raw hex.
2. Theme variants change token values in `theme.css`; component logic should not change per theme.
3. Any new state color role must be added as a primitive/token first, then consumed by components.

