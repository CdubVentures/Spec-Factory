# Phase 3 Pilot Migration Notes

Date: 2026-02-26  
Scope: canonical pilot components only

## AppShell (`src/components/layout/AppShell.tsx`)

Before:
- Header controls used repeated ad-hoc Tailwind border/background/text combinations.
- Field Test button active/idle visual states were embedded inline in a long conditional class string.

After:
- Adopted semantic shell classes:
  - `sf-shell-title`
  - `sf-shell-header-control`
  - `sf-shell-header-drawer`
  - `sf-shell-header-drawer-toggle`
  - `sf-shell-field-test-button-active`
  - `sf-shell-field-test-button-idle`
- Kept shell animation, layout behavior, and interaction logic unchanged.

Compatibility shortcuts kept:
- Structural layout utilities (`flex`, spacing, width transitions) remain in component class strings.
- Existing state indicator color classes (`text-sky-*`, `text-amber-*`) remain for now.

## DrawerShell (`src/components/common/DrawerShell.tsx`)

Before:
- Root, header, cards, section labels, action stack, input, and action button repeated mixed gray/light-dark utility combinations.
- Arbitrary typography drift present (`text-[10px]`, `text-[9px]`).

After:
- Standardized on semantic drawer primitives:
  - `sf-primitive-panel sf-drawer-shell`
  - `sf-drawer-header`
  - `sf-drawer-title`
  - `sf-drawer-subtitle`
  - `sf-drawer-close`
  - `sf-drawer-section-label`
  - `sf-drawer-card`
  - `sf-drawer-action-stack`
  - `sf-primitive-input sf-drawer-input`
  - `sf-drawer-apply-button`
- Replaced arbitrary text-size utilities with token-backed semantic text classes:
  - `sf-text-caption`
  - `sf-text-nano`

Compatibility shortcuts kept:
- Status/source badge color maps still use existing `sourceBadgeClass` + `traffic*` helpers.

## DataTable (`src/components/common/DataTable.tsx`)

Before:
- Table shell/head/row/empty styling used repeated gray utility combinations.
- Header typography used arbitrary size `text-[10px]`.

After:
- Migrated to semantic table primitives:
  - `sf-primitive-input sf-table-search-input`
  - `sf-primitive-table-shell`
  - `sf-table-head`
  - `sf-table-head-cell`
  - `sf-table-row`
  - `sf-table-expanded-row`
  - `sf-table-empty-state`
- Removed arbitrary head typography size drift (`text-[10px]`).
- Kept sorting, filtering, expansion, and persisted-state logic unchanged.

Compatibility shortcuts kept:
- Runtime layout inline style for fixed table layout remains (`style={{ tableLayout: 'fixed' }}`).

## Theme additions (`src/theme.css`)

Added semantic class definitions for pilot surfaces:
- App shell header/title/action state classes.
- Drawer shell panel/header/label/card/input/action classes.
- Table shell/head/cell/row/expanded/empty-state classes.
- Token-backed compact typography classes (`sf-text-caption`, `sf-text-nano`).

## Validation executed

- `node --test test/pilotThemeMigrationWiring.test.js` : PASS
- `node --test test/themeInfrastructureWiring.test.js` : PASS
- `node --test test/tailwindContentExtractionGuard.test.js` : PASS
- `npm --prefix tools/gui-react run build` : PASS
