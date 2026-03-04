# Phase 4 - Shared Primitive Layer

## Objective
Create a small reusable styling primitive layer so new features compose from approved building blocks instead of ad-hoc class combinations.

## How I will execute
1. Identify repeated UI patterns from pilot and audit results.
2. Implement semantic primitive classes aligned to tokens.
3. Provide usage guidance for each primitive.
4. Keep primitives minimal and composable.

## Primitive scope
1. `surface` primitives:
1. page shell container
2. card/panel container
3. elevated section
2. `form` primitives:
1. input
2. select
3. compact icon button
3. `table` primitives:
1. table shell
2. header cell
3. data row and empty state
4. `status` primitives:
1. success
2. warning
3. danger
4. info

## Detailed steps
1. Implement primitives in `theme.css` (or split into `theme.primitives.css` if needed).
2. Define naming standard:
1. prefix `sf-`
2. usage-first naming (`sf-input`, `sf-table-head-cell`)
3. no component-specific names unless cross-component reuse is proven
3. Add example usage snippets for each primitive in documentation.
4. Replace duplicated utility bundles in high-reuse shared components with primitives.
5. Keep escape hatches explicit:
1. local overrides allowed only when documented
2. overrides should still consume token values

## Deliverables
1. Primitive style class catalog
2. Usage guide with do/don't examples
3. Refactored shared components using primitives

## Exit criteria
1. New UI can be built using primitives without ad-hoc styling.
2. Primitive API is small and stable.
3. Drift reduction is visible in class duplication metrics.

## Risks and mitigation
1. Risk: too many primitives cause confusion.
Mitigation: keep only high-leverage primitives and reject low-reuse additions.
2. Risk: primitives become too rigid for edge cases.
Mitigation: allow token-based local extension with clear exception rules.

