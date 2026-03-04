# Typography Rules (2026-02-26)

## Purpose
- Stop font-size drift by assigning one default text token per UI role and nesting level.
- Keep typography predictable across panels, nested cards, and control rows.

## Font Size Contract
| Role | Typical location | Class/token | Rule |
| --- | --- | --- | --- |
| Page + section title | top-level headers, card headers | `text-sm font-semibold` | Only for structural headings. |
| Control label + button label + checkbox label + status line | form rows, toolbar actions, toggles | `sf-text-label` | Default interactive/body size. |
| Secondary context/meta | helper text, route keys, inline stats, subtle descriptors | `sf-text-caption` | Use for subordinate copy under a label/title. |
| Dense telemetry | high-density technical rows only | `sf-text-nano` | Allowed only when `sf-text-caption` causes overflow/noise. |
| Extreme density exception | rare diagnostics only | `sf-text-micro` | Exception-only; requires explicit drift guard coverage. |

## Token Baseline
- `--sf-token-font-size-caption`: `11px`
- `--sf-token-font-size-label`: `12px`

## Nesting Rules
1. Panel root heading: `text-sm font-semibold`
2. Nested card heading: `text-sm font-semibold`
3. First supporting line under heading: `sf-text-label`
4. Second supporting/meta line: `sf-text-caption`
5. Controls inside nested blocks: `sf-text-label`

## Prohibited Defaults
- Do not use raw `text-xs` in settings-adjacent surfaces.
- Do not use arbitrary text-size utilities (`text-[8|9|10|11px]`) in migrated surfaces.

## Sidebar Nav Rules
1. Primary and sub-sidebar nav buttons must use a uniform minimum height (`min-h-[74px]` in current standardization wave).
2. Do not place dynamic count copy (for example `N knobs`) inside sidebar nav buttons.
3. If counts are needed, show them in the detail/header area, not in the nav rail.

## Current Enforcement (Wave 09)
- `test/settingsAdjacentThemeDriftGuard.test.js`
  - blocks arbitrary micro text utilities
  - blocks raw `text-xs` utilities
  - keeps settings-adjacent typography on `sf-text-*` primitives
