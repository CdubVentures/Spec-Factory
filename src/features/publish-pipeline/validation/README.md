## Purpose

Pure deterministic field value validation against Field Studio contracts. 12-step pipeline: shape, type, unit, format, normalize, enum, list rules, rounding, range, constraints, component, sanity bounds. Every check is a pure function. No DB, no LLM, no side effects.

## Public API (The Contract)

```js
export { validateField }  from './validateField.js';
export { validateRecord } from './validateRecord.js';
```

### `validateField({ fieldKey, value, fieldRule, knownValues?, componentDb? })`

Returns `{ valid, value, confidence, repairs[], rejections[], unknownReason, repairPrompt }`.

### `validateRecord({ fields, fieldRules, knownValues?, componentDbs?, crossRules? })`

Returns `{ valid, fields, perField, crossFieldFailures[] }`.

## Dependencies

- **Allowed:** `src/shared/primitives.js`
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/db/*`, `src/pipeline/*`

## Domain Invariants

1. Shape failure short-circuits the entire pipeline — no downstream checks run.
2. Absence normalization (null/undefined/empty to canonical form) runs before shape check.
3. `"none"` is a semantic value, NOT an unknown token.
4. Auto-coercion only where safe and deterministic (e.g., `"42"` to `42`). Never guess.
5. Unk-token check runs before numeric parsing — `"N/A"` is recognized as unknown, not rejected as non-numeric.
6. O(1) scaling — dispatches by `parse.template`. Adding a field or category requires zero validator code changes.
