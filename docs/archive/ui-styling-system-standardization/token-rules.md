# Token Rules (Phase 1)

Date: 2026-02-26  
Applies to: `tools/gui-react/src/**/*.{ts,tsx,css}`

## 1. Naming rules

1. Tokens must be declared in one of two namespaces only:
- `scale.<domain>.<name>`
- `semantic.<domain>.<intent>`
2. Token names must express intent, not component ownership.
3. Status naming is fixed: `success`, `warning`, `danger`, `info`, `pending`.
4. No alias duplicates are allowed for the same value+intent pair.
5. Semantic tokens must be the primary API consumed by components.
6. Scale tokens are internal building blocks for semantic tokens.

## 2. Allowed value sets

### Typography

Allowed token set:
- `scale.font.micro` (8px)
- `scale.font.nano` (9px)
- `scale.font.caption` (10px)
- `scale.font.label` (11px)
- `scale.font.body-xs` (12px)
- `scale.font.body-sm` (14px)
- `scale.font.body` (16px)
- `scale.font.title-sm` (18px)
- `scale.font.title` (20px)
- `scale.font.title-lg` (24px)
- `scale.font.display-sm` (30px)
- `scale.font.display` (36px)

Usage restrictions:
- `micro` and `nano` are allowed only in dense UI metadata/badges.
- Body content must use `body-xs`, `body-sm`, or `body`.
- Arbitrary `text-[Npx]` is forbidden.

### Spacing

Allowed token set:
- `scale.spacing.0`
- `scale.spacing.0-5`
- `scale.spacing.1`
- `scale.spacing.1-5`
- `scale.spacing.2`
- `scale.spacing.2-5`
- `scale.spacing.3`
- `scale.spacing.4`
- `scale.spacing.6`
- `scale.spacing.8`
- `scale.spacing.12`

Disallowed values (from Phase 0 drift):
- `3.5`
- `7`
- Arbitrary bracket spacing values.

### Radius

Allowed token set:
- `scale.radius.none`
- `scale.radius.sm`
- `scale.radius.md`
- `scale.radius.lg`
- `scale.radius.pill`

Restrictions:
- `pill` only for pills/chips/circular controls.
- `none` must be justified by explicit UX requirement.

### Color

Allowed component-facing tokens:
- `semantic.surface.*`
- `semantic.text.*`
- `semantic.border.*`
- `semantic.state.*`
- `semantic.action.*`
- `semantic.chart.*`

Disallowed direct usage:
- New `text-gray-*`, `bg-gray-*`, `border-gray-*` additions.
- New raw family status colors (`red`, `amber`, `green`, `blue`, `purple`) outside semantic state tokens.
- Raw hex literals in TS/TSX.

## 3. Dark mode parity rules

1. Every semantic color token must define light and dark values.
2. Light and dark token intent must remain equivalent.
3. New semantic color tokens are invalid without both mode values.
4. Components must not encode ad-hoc `dark:*` color forks where semantic tokens exist.

## 4. Contrast safety rules

1. `semantic.text.primary` on `semantic.surface.base` must meet WCAG 2.1 AA (4.5:1).
2. `semantic.text.muted` on `semantic.surface.base` must target >= 4.5:1 for normal text.
3. State foreground text against state background must target >= 4.5:1.
4. Decorative chart colors are exempt from text contrast but must remain visually distinguishable.

## 5. Inline style rules

Allowed inline styles:
- Runtime layout calculations only (`width`, `height`, `left`, `top`, `right`, `bottom`, `transform`, `order`, virtualized geometry).

Disallowed inline styles:
- `fontSize`, `lineHeight`, `padding`, `borderRadius`, `color`, `background`, `borderColor` literals unless mapped to semantic token variables.

## 6. Migration and enforcement rules

1. All legacy patterns must map through `token-mapping-table.md` before rewrite.
2. When replacing legacy classes, prefer semantic tokens over scale tokens.
3. No new drift patterns may be introduced while migration is active.
4. CI enforcement (Phase 6) must block:
- raw hex in TS/TSX,
- arbitrary `text-[Npx]`,
- out-of-scale spacing/radius values,
- new non-semantic color family usage.

## 7. Token expansion process

1. Propose new token with business intent and reuse evidence (minimum 3 callsites).
2. Add token to `token-contract.md` with light/dark values and rationale.
3. Add migration impact row to `token-mapping-table.md`.
4. Update this rules file if allowed sets change.
5. Merge only when naming collisions are resolved.
