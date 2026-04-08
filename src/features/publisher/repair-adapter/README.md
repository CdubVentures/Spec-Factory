## Purpose

LLM repair orchestration for field values that fail deterministic validation. Builds prompts (P1-P7) from rejection reason codes, calls an injected LLM function, validates the structured response via Zod, applies decisions, and re-validates through `validateField()` / `validateRecord()` (closed loop). This is Attempt 2 in the 3-attempt escalation chain.

## Public API (The Contract)

```js
export { repairField }      from './repairField.js';
export { repairCrossField } from './repairField.js';
```

### `repairField({ validationResult, fieldKey, fieldRule, knownValues?, componentDb?, callLlm })`

Returns `{ status, value, confidence, decisions, revalidation, promptId, flaggedForReview, error? }`.

### `repairCrossField({ crossFieldFailures, fields, productName, fieldRules, knownValues?, componentDbs?, callLlm })`

Returns `{ status, repairs, revalidation, promptId, flaggedForReview, error? }`.

## Dependencies

- **Allowed:** `../validation/validateField.js`, `../validation/validateRecord.js`, `zod` (package)
- **Injected:** `callLlm` async function (wired by caller, never imported)
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/core/*`, `src/db/*`

## Domain Invariants

1. `callLlm` is always injected — never imported from core or other features.
2. LLM output is never trusted directly — re-validation through validateField is mandatory.
3. Shape failures (P8) are excluded — they go to source LLM rerun, not repair.
4. Single LLM call per invocation — no retry loops. Escalation is the caller's job.
5. Confidence thresholds: ≥0.8 auto-apply, 0.5-0.8 flag for review, <0.5 reject.
