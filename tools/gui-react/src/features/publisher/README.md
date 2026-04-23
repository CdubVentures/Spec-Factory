## Purpose
Frontend feature boundary for publisher-owned UI primitives. Houses inputs that
configure field-rule knobs consumed at runtime by `src/features/publisher/**`
(deterministic validation pipeline). Colocating the UI and the runtime consumer
prevents accidental deletion of config surfaces during unrelated feature cleanups.

## Public API (The Contract)
- `FormatPatternInput` — edits `enum.match.format_hint` on a field rule. The
  value is consumed by `src/features/publisher/validation/checks/checkFormat.js`
  (Step 6, Format Check) as a custom regex pattern.

Consumers must import from `tools/gui-react/src/features/publisher/index.ts`.

## Dependencies
- Allowed: `tools/gui-react/src/shared/ui/**`, `react`.
- Forbidden: other feature internals (`features/studio/**`, `features/review/**`, etc.),
  `tools/gui-react/src/utils/studioConstants.ts` (studio-scoped styling).

## Domain Invariants
- Components here configure knobs consumed by the backend publisher feature. Do
  not add UI for knobs owned by other backend features.
- Components are dumb: they accept value + onChange + display flags. No
  mutations, no API calls, no runtime-settings store reads.
- When a publisher backend knob is retired, delete the corresponding input here
  in the same change set.
