## Purpose

Single gate for all field data entering the product record. No field value reaches `item_field_state` or `product.json fields[]` without passing through this pipeline. Four sub-modules: `validation/` (pure deterministic checks — COMPLETE, 458 tests), `repair-adapter/` (LLM repair orchestration), `candidate-gate/` (source validate + persist), `publisher/` (resolve + cross-validate + publish).

## Public API (The Contract)

```js
// src/features/publish-pipeline/index.js
export { submitCandidate } from './candidate-gate/submitCandidate.js';
export { publishResolved } from './publisher/publishResolved.js';
export { validateField }   from './validation/validateField.js';
export { validateRecord }  from './validation/validateRecord.js';
```

## Dependencies

- **Allowed:** `src/shared/`
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/db/*` (candidate-gate and publisher access DB through injected dependencies, never direct imports)

## Domain Invariants

1. No field value reaches `item_field_state` or `product.json fields[]` without passing validation.
2. Validation is deterministic and pure — same input always produces same output.
3. Field Studio rules are the sole source of truth for what is valid.
4. LLM repair prompts are returned as data — the validator never calls an LLM.
5. Two-phase write: validated candidates first (per-source), resolved winners second (per-product).
