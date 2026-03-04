# Phase 2 - Theme Infrastructure Implementation

## Objective
Implement a central theme source and expose it consistently through CSS variables and Tailwind semantic utilities, without breaking existing UI.

## How I will execute
1. Introduce a dedicated theme source file.
2. Wire tokens into global CSS and Tailwind.
3. Keep legacy aliases during transition for safe incremental rollout.
4. Validate no build/runtime regressions.

## Detailed steps
1. Create `tools/gui-react/src/theme.css` with:
1. Color tokens for light and dark mode
2. Typography tokens (font families, sizes, line heights)
3. Spacing and radius scales
4. Semantic component primitives (inputs, panels, table shell)
2. Update `tools/gui-react/src/main.tsx` imports so theme loads before component styles.
3. Refactor `tools/gui-react/src/index.css`:
1. Move hardcoded root values to token references.
2. Preserve current shell gradients and behavior.
3. Keep backwards-compatible aliases (`--sf-*`) while migration is in progress.
4. Extend `tools/gui-react/tailwind.config.ts`:
1. Map semantic color names to CSS variable channels.
2. Expose approved spacing/radius keys for consistent utility usage.
3. Add semantic font family names.
5. Confirm compatibility with existing classes and dark mode toggling (`html.dark`).

## Validation
1. Run build:
```powershell
npm run build
```
2. Manual spot checks:
1. App shell rendering in light/dark
2. Drawer and table surfaces
3. Text contrast for muted and status messages

## Deliverables
1. Centralized `theme.css`
2. Updated `index.css` consuming tokenized values
3. Updated `tailwind.config.ts` with semantic mappings
4. Build verification notes

## Exit criteria
1. Tokens are globally available.
2. Existing UI remains visually stable.
3. Tailwind supports semantic token usage for new work.

## Risks and mitigation
1. Risk: partial migration breaks components using old variables.
Mitigation: keep alias variables until Phase 5 completion.
2. Risk: theme order/load issues.
Mitigation: explicitly control import order in `main.tsx`.

