# Implementation Assets

> **Purpose:** Explain which assets remain under `docs/implementation/` after the LLM-first doc rebuild and why they are not part of the numbered current-state reading order.
> **Prerequisites:** [../README.md](../README.md), [../audit/documentation-audit-ledger.md](../audit/documentation-audit-ledger.md)
> **Last validated:** 2026-03-15

`docs/implementation/` is no longer part of the current-state reading order. This README is the maintained entrypoint for the subtree. The historical planning docs under `docs/implementation/ai-indexing-plans/` were explicitly excluded from this audit by operator instruction, so they remain untouched and should not be treated as current-state authority.

## Retained Asset Classes

| Path | Why it remains | Authority level |
|------|----------------|-----------------|
| `docs/implementation/README.md` | entrypoint that explains subtree status and the audit exclusion | supplemental only |
| `docs/implementation/ai-indexing-plans/*.md` | historical planning docs preserved untouched because this audit was instructed not to edit them | excluded historical context |
| `docs/implementation/ai-indexing-plans/schema/*.json` | consumed by `src/indexlab/indexingSchemaPacketsValidator.js` at runtime | runtime dependency |
| non-Markdown assets elsewhere under `docs/implementation/` | retained only if not required to rebuild the numbered doc tree and not currently blocking runtime/tests | supplemental only |

## Guardrails

- Do not read this subtree before the numbered docs unless you specifically need a retained schema or artifact.
- If content under this subtree disagrees with `docs/01-*` through `docs/07-*`, the numbered docs and live source win.
- Treat `docs/implementation/ai-indexing-plans/` as excluded historical material unless a separate task explicitly re-audits it.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/indexlab/indexingSchemaPacketsValidator.js` | runtime dependency on `docs/implementation/ai-indexing-plans/schema/*.json` |
| source | `docs/audit/documentation-audit-ledger.md` | retention rationale and explicit audit exclusion for this subtree |

## Related Documents

- [../README.md](../README.md) - current doc entrypoint and reading order.
- [../06-references/integration-boundaries.md](../06-references/integration-boundaries.md) - describes the schema-validator boundary that still reads docs assets.
