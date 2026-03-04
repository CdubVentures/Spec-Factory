# Phase 1 - Token Contract and Naming Rules

## Objective
Define one stable token contract for colors, typography, spacing, and border radius, including semantic naming rules and light/dark mappings.

## How I will execute
1. Convert Phase 0 findings into a token matrix.
2. Split tokens into `semantic` and `scale` layers.
3. Define allowed value sets for future development.
4. Map every existing high-usage style pattern to a token.

## Token model
1. `Scale tokens`: raw value ladders.
1. Color scales (`gray-100`, `gray-200`, etc.)
2. Spacing (`space-1`, `space-1-5`, `space-2`, etc.)
3. Radius (`radius-sm`, `radius-md`, `radius-lg`)
4. Font sizes (`caption`, `label`, `body-sm`, `body`, `title`)
2. `Semantic tokens`: usage intent.
1. Surface (`surface`, `surface-elevated`, `panel`)
2. Text (`text-primary`, `text-muted`, `text-inverse`)
3. State (`status-success`, `status-warning`, `status-danger`, `status-info`)
4. Border (`border-default`, `border-strong`, `border-subtle`)

## Detailed steps
1. Build a token dictionary draft and align each token to current usage frequency.
2. Remove ambiguous names and enforce naming rules:
1. Token names must describe intent, not component.
2. Status names must match semantic states, not arbitrary colors.
3. No duplicate aliases that represent the same value.
3. Define strict allowed sets:
1. Typography sizes allowed for UI text.
2. Spacing sizes allowed for margins/padding/gaps.
3. Radius sizes allowed for controls, cards, pills.
4. Create a compatibility mapping table from existing classes/variables to the new token contract.
5. Review contract for dark mode parity and contrast safety.

## Deliverables
1. `token-contract.md` containing full token dictionary
2. `token-mapping-table.md` mapping old values to new tokens
3. `token-rules.md` defining allowed value sets and naming rules

## Exit criteria
1. Every common style pattern has a token target.
2. No unresolved naming collisions.
3. Light and dark mode mappings are complete.

## Risks and mitigation
1. Risk: too many tokens make adoption harder.
Mitigation: keep only high-reuse tokens; defer low-reuse values until proven.
2. Risk: semantic names become too generic.
Mitigation: require a clear usage definition for every semantic token.

