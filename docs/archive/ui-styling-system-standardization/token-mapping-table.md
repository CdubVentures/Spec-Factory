# Token Mapping Table (Phase 1)

Date: 2026-02-26  
Source: `phase-0-token-frequency.csv`

## Color mappings (ranked by usage)

| Legacy pattern | Phase 0 usage | Token target | Migration rule |
|---|---:|---|---|
| `text-gray-400` | 1030 | `semantic.text.subtle` | Replace direct gray metadata text usage. |
| `text-gray-500` | 922 | `semantic.text.muted` | Replace secondary text defaults. |
| `text-gray-700` + `dark:text-gray-300` | 198 + 261 | `semantic.text.primary` | Replace primary text pairs. |
| `text-gray-600` + `dark:text-gray-400` | 270 + 1030 | `semantic.text.muted` | Use muted token for helper labels. |
| `border-gray-200` + `dark:border-gray-700` | 487 + 486 | `semantic.border.default` | Replace standard container borders. |
| `border-gray-300` + `dark:border-gray-600` | 242 + 237 | `semantic.border.subtle` | Replace input/divider border variants. |
| `bg-white` + `dark:bg-gray-800` | 207 + 162 | `semantic.surface.elevated` | Replace card/panel fill pairs. |
| `bg-gray-100` + dark equivalents | 184 | `semantic.surface.panel` | Replace secondary panel backgrounds. |
| `text-red-*` / `bg-red-*` / `border-red-*` | 670 (family) | `semantic.state.danger.{fg,bg,border}` | Replace all danger/error status colors. |
| `text-amber-*` + `text-orange-*` + `text-yellow-*` / related bg,border | 819 (combined families) | `semantic.state.warning.{fg,bg,border}` | Replace warning/exhausted/attention states. |
| `text-green-*` + `text-emerald-*` / related bg,border | 636 (combined families) | `semantic.state.success.{fg,bg,border}` | Replace success/complete/manual states. |
| `text-blue-*` + `text-sky-*` + `text-cyan-*` / related bg,border | 667 (combined families) | `semantic.state.info.{fg,bg,border}` | Replace info/running/link-state colors where not action buttons. |
| `text-purple-*` + `text-violet-*` + `text-fuchsia-*` / related bg,border | 319 (combined families) | `semantic.state.pending.{fg,bg,border}` | Replace pending-ai/pending-shared status badges. |
| `text-accent` | 39 | `semantic.text.link` | Keep intent as link/action text. |
| `bg-accent` + `border-accent` | 31 + 20 | `semantic.action.primary.{bg,border}` | Replace primary CTA fills and borders. |
| `#4361ee` (charts) | 2 | `semantic.chart.series.primary` | Replace billing primary chart series hardcode. |
| `#3b82f6` / `#3b82f680` (charts) | 2 | `semantic.chart.series.info` | Replace docs/min series hardcode. |
| `#10b981` / `#10b98180` (charts) | 2 | `semantic.chart.series.success` | Replace fields/min series hardcode. |

## Typography mappings (ranked by usage)

| Legacy pattern | Phase 0 usage | Token target | Migration rule |
|---|---:|---|---|
| `text-[10px]` | 588 | `scale.font.caption` | Replace all arbitrary 10px labels and badges. |
| `text-[11px]` | 229 | `scale.font.label` | Replace all arbitrary 11px labels. |
| `text-[9px]` | 84 | `scale.font.nano` | Allowed only for dense metadata chips. |
| `text-[8px]` | 14 | `scale.font.micro` | Allowed only for compact, non-body micro labels. |
| `text-[12px]` | 3 | `scale.font.body-xs` | Replace with body-xs token. |
| `text-xs` | 854 | `scale.font.body-xs` | Keep, but route through semantic text style utilities. |
| `text-sm` | 282 | `scale.font.body-sm` | Keep, but route through semantic text style utilities. |
| `text-base` | 2 | `scale.font.body` | Keep as body default. |
| `text-lg` | 25 | `scale.font.title-sm` | Replace heading/small title intent. |
| `text-xl` / `text-2xl` / `text-3xl` / `text-4xl` | 3 / 5 / 8 / 1 | `scale.font.title` / `scale.font.title-lg` / `scale.font.display-sm` / `scale.font.display` | Keep only for heading hierarchy. |

## Spacing mappings (ranked by usage)

| Legacy pattern | Phase 0 usage | Token target | Migration rule |
|---|---:|---|---|
| `py-1` | 844 | `scale.spacing.1` | Keep via spacing utility wrappers. |
| `px-2` | 600 | `scale.spacing.2` | Keep via spacing utility wrappers. |
| `pr-3` | 519 | `scale.spacing.3` | Keep via spacing utility wrappers. |
| `gap-2` | 386 | `scale.spacing.2` | Keep via spacing utility wrappers. |
| `py-0.5` | 363 | `scale.spacing.0-5` | Keep via spacing utility wrappers. |
| `py-2` | 311 | `scale.spacing.2` | Keep via spacing utility wrappers. |
| `px-3` | 308 | `scale.spacing.3` | Keep via spacing utility wrappers. |
| `p-3.5` | 1 | `scale.spacing.3` or `scale.spacing.4` | Choose nearest token by layout context; no direct 3.5 token. |
| `pr-7` | 1 | `scale.spacing.6` or `scale.spacing.8` | Choose nearest token by layout context; no direct 7 token. |
| `space-y-3.5` | 1 | `scale.spacing.3` or `scale.spacing.4` | Replace with nearest standardized stack spacing. |

## Radius mappings

| Legacy pattern | Phase 0 usage | Token target | Migration rule |
|---|---:|---|---|
| `rounded` | 1064 | `scale.radius.sm` | Default control/chip radius. |
| `rounded-full` | 163 | `scale.radius.pill` | Pills, badges, circular controls only. |
| `rounded-lg` | 58 | `scale.radius.lg` | Cards/drawers/elevated containers. |
| `rounded-md` | 9 | `scale.radius.md` | Mid-level controls as needed. |
| `rounded-none` | 1 | `scale.radius.none` | Keep only when hard square edge is intentional. |

## Inline style and raw literal mappings

| Legacy pattern | Phase 0 usage | Token target | Migration rule |
|---|---:|---|---|
| `style={{ color: 'var(--sf-muted)' }}` and similar semantic-var usages | 6 | `semantic.text.muted` or corresponding semantic token | Keep only if bound through token alias utility. |
| `style={{ fontSize: '8px', lineHeight: '12px', padding: '0 3px', borderRadius: '2px' }}` | 1 | `scale.font.micro`, `scale.spacing.*`, `scale.radius.*` | Remove visual literals and replace with tokenized classes/utilities. |
| Runtime layout inline styles (`width`, `height`, `left`, `top`, `order`, `transform`) | 190 | N/A (allowed runtime layout) | Keep as runtime-calculated layout only. |
| Raw hex literals in TSX/CSS (`#4361ee`, source badge palette, chart colors) | 19 drift + 3 near-duplicate | semantic token references from `token-contract.md` | Replace hardcoded literals with semantic token aliases. |

## Migration priority lanes

1. Typography drift (`text-[10px]`, `text-[11px]`, `text-[9px]`, `text-[8px]`).
2. Status color drift families (red/amber/green/blue/purple).
3. Raw hex chart and source-badge literals.
4. Remaining near-duplicate gray/surface pair collapse to semantic surface and text tokens.
