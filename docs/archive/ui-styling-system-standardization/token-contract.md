# Token Contract (Phase 1)

Date: 2026-02-26  
Source baseline: `phase-0-token-frequency.csv`, `phase-0-audit-summary.json`

## Goal

Define one stable token contract for UI styling with two layers:
1. `scale` tokens: raw value ladders.
2. `semantic` tokens: intent-based tokens consumed by components.

This contract is the authority for color, typography, spacing, and radius in the React GUI.

## Naming contract

- Scale token namespace: `scale.<domain>.<name>`
- Semantic token namespace: `semantic.<domain>.<intent>`
- Implementation aliases (CSS custom properties): `--sf-<domain>-<intent>`
- Token names must describe usage intent, never component names.

## Scale tokens

### Color scale

Derived from current Tailwind + CSS variable sources.

| Token | Light | Dark | Source |
|---|---|---|---|
| `scale.color.neutral.50` | `#f8fafc` | `#0a1224` | `tailwind.config.ts` gray scale |
| `scale.color.neutral.100` | `#eef2f9` | `#111f35` | `tailwind.config.ts` gray scale |
| `scale.color.neutral.200` | `#dce3f3` | `#1f2f49` | `tailwind.config.ts` gray scale |
| `scale.color.neutral.300` | `#c1ccdf` | `#334155` | `tailwind.config.ts` gray scale |
| `scale.color.neutral.400` | `#94a3b8` | `#4b5f7f` | `tailwind.config.ts` gray scale |
| `scale.color.neutral.500` | `#64748b` | `#64748b` | `tailwind.config.ts` gray scale |
| `scale.color.accent.500` | `#3b82f6` | `#6366f1` | `tailwind.config.ts` accent |
| `scale.color.surface.base` | `#f8fafc` | `#0a1330` | `index.css` + `tailwind.config.ts` |
| `scale.color.surface.panel` | `#eef2ff` | `#0d1834` | `index.css` |
| `scale.color.surface.top` | `#ffffff` | `#111f41` | `index.css` |
| `scale.color.surface.border` | `#d7e0f1` | `#243a65` | `index.css` |

### Status scale

| Token | Light | Dark | Notes |
|---|---|---|---|
| `scale.color.status.success.fg` | `#166534` | `#86efac` | from green family usage |
| `scale.color.status.success.bg` | `rgba(34,197,94,0.12)` | `rgba(34,197,94,0.22)` | panel/chip usage |
| `scale.color.status.success.border` | `rgba(34,197,94,0.32)` | `rgba(34,197,94,0.45)` | panel/chip usage |
| `scale.color.status.warning.fg` | `#b45309` | `#fcd34d` | aligns `sf-shell-warning` |
| `scale.color.status.warning.bg` | `rgba(234,179,8,0.12)` | `rgba(234,179,8,0.22)` | aligns `sf-shell-warning` |
| `scale.color.status.warning.border` | `rgba(234,179,8,0.32)` | `rgba(234,179,8,0.45)` | aligns `sf-shell-warning` |
| `scale.color.status.danger.fg` | `#b91c1c` | `#fca5a5` | from red family usage |
| `scale.color.status.danger.bg` | `rgba(239,68,68,0.12)` | `rgba(239,68,68,0.22)` | from red family usage |
| `scale.color.status.danger.border` | `rgba(239,68,68,0.32)` | `rgba(239,68,68,0.45)` | from red family usage |
| `scale.color.status.info.fg` | `#1d4ed8` | `#93c5fd` | aligns `sf-shell-saving` intent |
| `scale.color.status.info.bg` | `rgba(14,165,233,0.12)` | `rgba(14,165,233,0.22)` | aligns `sf-shell-saving` |
| `scale.color.status.info.border` | `rgba(14,165,233,0.28)` | `rgba(14,165,233,0.4)` | aligns `sf-shell-saving` |
| `scale.color.status.pending.fg` | `#7c3aed` | `#c4b5fd` | from purple family usage |
| `scale.color.status.pending.bg` | `rgba(168,85,247,0.12)` | `rgba(168,85,247,0.22)` | from pending-ai badge patterns |
| `scale.color.status.pending.border` | `rgba(168,85,247,0.32)` | `rgba(168,85,247,0.45)` | from pending-ai badge patterns |

### Typography scale

| Token | Value | Typical replacement |
|---|---:|---|
| `scale.font.micro` | `8px` | `text-[8px]` (restricted to dense badges only) |
| `scale.font.nano` | `9px` | `text-[9px]` |
| `scale.font.caption` | `10px` | `text-[10px]` |
| `scale.font.label` | `11px` | `text-[11px]` |
| `scale.font.body-xs` | `12px` | `text-xs` |
| `scale.font.body-sm` | `14px` | `text-sm` |
| `scale.font.body` | `16px` | `text-base` |
| `scale.font.title-sm` | `18px` | `text-lg` |
| `scale.font.title` | `20px` | `text-xl` |
| `scale.font.title-lg` | `24px` | `text-2xl` |
| `scale.font.display-sm` | `30px` | `text-3xl` |
| `scale.font.display` | `36px` | `text-4xl` |

### Spacing scale

| Token | Value (rem) | Tailwind equivalent |
|---|---:|---|
| `scale.spacing.0` | `0` | `0` |
| `scale.spacing.0-5` | `0.125` | `0.5` |
| `scale.spacing.1` | `0.25` | `1` |
| `scale.spacing.1-5` | `0.375` | `1.5` |
| `scale.spacing.2` | `0.5` | `2` |
| `scale.spacing.2-5` | `0.625` | `2.5` |
| `scale.spacing.3` | `0.75` | `3` |
| `scale.spacing.4` | `1` | `4` |
| `scale.spacing.6` | `1.5` | `6` |
| `scale.spacing.8` | `2` | `8` |
| `scale.spacing.12` | `3` | `12` |

### Radius scale

| Token | Value | Tailwind equivalent |
|---|---:|---|
| `scale.radius.none` | `0` | `rounded-none` |
| `scale.radius.sm` | `0.25rem` | `rounded` |
| `scale.radius.md` | `0.375rem` | `rounded-md` |
| `scale.radius.lg` | `0.5rem` | `rounded-lg` |
| `scale.radius.pill` | `9999px` | `rounded-full` |

## Semantic tokens

### Surface + layout intent

| Semantic token | Light | Dark | Scale source |
|---|---|---|---|
| `semantic.surface.canvas` | `#f8fbff` | `#060b1a` | `--sf-bg-start` |
| `semantic.surface.canvas-accent` | `#eaf0ff` | `#0f1a35` | `--sf-bg-end` |
| `semantic.surface.base` | `#f8fafc` | `#0a1330` | `scale.color.surface.base` |
| `semantic.surface.elevated` | `#ffffff` | `#111f41` | `scale.color.surface.top` |
| `semantic.surface.panel` | `#eef2ff` | `#0d1834` | `scale.color.surface.panel` |
| `semantic.border.default` | `#d7e0f1` | `#243a65` | `scale.color.surface.border` |
| `semantic.border.subtle` | `rgba(148,163,184,0.28)` | `rgba(148,163,184,0.28)` | current sidebar control border |

### Text intent

| Semantic token | Light | Dark | Intended use |
|---|---|---|---|
| `semantic.text.primary` | `#0b1220` | `#ecf1ff` | primary content |
| `semantic.text.muted` | `#54617a` | `#adc2eb` | secondary text |
| `semantic.text.subtle` | `#64748b` | `#94a3b8` | metadata/captions |
| `semantic.text.inverse` | `#ffffff` | `#0b1220` | text on strong fills |
| `semantic.text.link` | `#3b82f6` | `#93c5fd` | links/actions |

### Action intent

| Semantic token | Light | Dark | Scale source |
|---|---|---|---|
| `semantic.action.primary.bg` | `#3b82f6` | `#6366f1` | `scale.color.accent.500` |
| `semantic.action.primary.fg` | `#ffffff` | `#ffffff` | `semantic.text.inverse` |
| `semantic.action.primary.border` | `#3b82f6` | `#6366f1` | `scale.color.accent.500` |

### State intent

| Semantic token | Light | Dark | Scale source |
|---|---|---|---|
| `semantic.state.success.fg` | `#166534` | `#86efac` | `scale.color.status.success.fg` |
| `semantic.state.success.bg` | `rgba(34,197,94,0.12)` | `rgba(34,197,94,0.22)` | `scale.color.status.success.bg` |
| `semantic.state.success.border` | `rgba(34,197,94,0.32)` | `rgba(34,197,94,0.45)` | `scale.color.status.success.border` |
| `semantic.state.warning.fg` | `#b45309` | `#fcd34d` | `scale.color.status.warning.fg` |
| `semantic.state.warning.bg` | `rgba(234,179,8,0.12)` | `rgba(234,179,8,0.22)` | `scale.color.status.warning.bg` |
| `semantic.state.warning.border` | `rgba(234,179,8,0.32)` | `rgba(234,179,8,0.45)` | `scale.color.status.warning.border` |
| `semantic.state.danger.fg` | `#b91c1c` | `#fca5a5` | `scale.color.status.danger.fg` |
| `semantic.state.danger.bg` | `rgba(239,68,68,0.12)` | `rgba(239,68,68,0.22)` | `scale.color.status.danger.bg` |
| `semantic.state.danger.border` | `rgba(239,68,68,0.32)` | `rgba(239,68,68,0.45)` | `scale.color.status.danger.border` |
| `semantic.state.info.fg` | `#1d4ed8` | `#93c5fd` | `scale.color.status.info.fg` |
| `semantic.state.info.bg` | `rgba(14,165,233,0.12)` | `rgba(14,165,233,0.22)` | `scale.color.status.info.bg` |
| `semantic.state.info.border` | `rgba(14,165,233,0.28)` | `rgba(14,165,233,0.4)` | `scale.color.status.info.border` |
| `semantic.state.pending.fg` | `#7c3aed` | `#c4b5fd` | `scale.color.status.pending.fg` |
| `semantic.state.pending.bg` | `rgba(168,85,247,0.12)` | `rgba(168,85,247,0.22)` | `scale.color.status.pending.bg` |
| `semantic.state.pending.border` | `rgba(168,85,247,0.32)` | `rgba(168,85,247,0.45)` | `scale.color.status.pending.border` |

### Data visualization intent

| Semantic token | Light | Dark | Notes |
|---|---|---|---|
| `semantic.chart.series.primary` | `#4361ee` | `#6366f1` | billing/runtime chart primary series |
| `semantic.chart.series.success` | `#10b981` | `#34d399` | chart success series |
| `semantic.chart.series.info` | `#3b82f6` | `#60a5fa` | chart info series |

## Dark mode parity contract

- Every semantic color token must define both `light` and `dark` values.
- Semantic tokens may reference different scale tokens by mode; mode parity is mandatory.
- No component may bind directly to a mode-specific raw class (`dark:text-*`) when a semantic token exists.

## Contract checkpoints for next phase

1. This contract is the only source for new style values.
2. Legacy raw classes migrate through `token-mapping-table.md`.
3. Rule enforcement is defined in `token-rules.md`.
