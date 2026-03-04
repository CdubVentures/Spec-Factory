# Phase 4 Primitive Layer Catalog and Usage Guide

Date: 2026-02-26

## Primitive catalog

### Surface primitives

| Class | Purpose | Token basis |
|---|---|---|
| `sf-surface-shell` | Page-level shell surface baseline | `--sf-surface*`, `--sf-color-text-primary-rgb` |
| `sf-surface-panel` | Card/panel container baseline | `--sf-surface*`, `--sf-surface-border`, `--sf-radius-lg` |
| `sf-surface-elevated` | Elevated subsection container | `--sf-color-surface-elevated-rgb`, `--sf-surface-border`, `--sf-radius-md` |

### Form primitives

| Class | Purpose | Token basis |
|---|---|---|
| `sf-input` | Shared text input baseline | text/border/surface tokens, spacing + radius tokens |
| `sf-select` | Shared select baseline | inherits `sf-input` styling + select-specific behavior |
| `sf-icon-button` | Compact icon-button baseline | border/surface/text tokens + hover transitions |

### Table primitives

| Class | Purpose | Token basis |
|---|---|---|
| `sf-table-shell` | Shared table container shell | surface/border/radius tokens |
| `sf-table-head-cell` | Header cell typography + spacing | font size + text-muted + spacing tokens |
| `sf-table-row` | Shared row interaction baseline | panel hover token channels |
| `sf-table-empty-state` | Shared empty-state text | text-subtle token |

### Status primitives

| Class | Purpose | Token basis |
|---|---|---|
| `sf-status` | Base status frame (padding/radius/border/font) | spacing/radius/font tokens |
| `sf-status-success` | Success foreground/background/border | `--sf-state-success-*` |
| `sf-status-warning` | Warning foreground/background/border | `--sf-state-warning-*` |
| `sf-status-danger` | Danger foreground/background/border | `--sf-state-danger-*` |
| `sf-status-info` | Info foreground/background/border | `--sf-state-info-*` |

## Usage snippets

### Do: compose from primitives first

```tsx
<div className="sf-surface-panel p-4 space-y-3">
  <label className="text-xs font-medium sf-drawer-section-label">Name</label>
  <input className="sf-input w-full" />
  <button className="sf-icon-button h-8 w-8" aria-label="toggle" />
</div>
```

```tsx
<div className="sf-table-shell overflow-auto max-h-[600px]">
  <table className="min-w-full text-sm" style={{ tableLayout: 'fixed' }}>
    <thead className="sf-table-head">
      <tr>
        <th className="sf-table-head-cell">Field</th>
      </tr>
    </thead>
  </table>
</div>
```

```tsx
<div className="sf-status sf-status-warning">
  Saving configuration changes...
</div>
```

### Don’t: re-introduce ad-hoc bundles

```tsx
// Avoid repeating raw style bundles:
<div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg" />
<input className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800" />
<div className="text-[10px] text-gray-500" />
```

## Escape-hatch rules

Allowed:
- Layout-only local utilities (`flex`, `grid`, sizing, positioning, overflow, responsive visibility).
- Token-based local overrides when primitive coverage is insufficient.

Required when overriding:
1. Keep override values token-backed (no raw hex, no arbitrary `text-[Npx]`).
2. Keep primitive class in place; append override class rather than replacing primitive.
3. Document the reason in migration notes when introducing a new override pattern.

## Refactored shared components (Phase 4)

- `src/components/layout/AppShell.tsx`
  - Added primitive consumption: `sf-surface-shell`, `sf-icon-button`, `sf-status*`.
- `src/components/common/DrawerShell.tsx`
  - Added primitive consumption: `sf-surface-panel`, `sf-input`.
- `src/components/common/DataTable.tsx`
  - Added primitive consumption: `sf-table-shell`, `sf-input`.

## Drift reduction signal

Pilot shared components now consume shared primitives for:
- surface bundles (panel/shell),
- compact controls (icon button/input),
- table shell/head/row/empty patterns,
- status message framing and palette semantics.

This reduces repeated gray utility bundles and keeps new UI composition on token-backed primitives.
