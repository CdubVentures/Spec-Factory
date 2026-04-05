# Implementation Assets

> **Purpose:** Explain the status of the historical and supplemental assets kept under `docs/implementation/`.
> **Prerequisites:** [../README.md](../README.md), [../05-operations/documentation-audit-ledger.md](../05-operations/documentation-audit-ledger.md)
> **Last validated:** 2026-04-04

`docs/implementation/` is not part of the current-state numbered reading order. Treat the subtree as supplemental historical or design-depth material. If any file here disagrees with `docs/01-*` through `docs/07-*` or the live source tree, the numbered docs and source win.

## Retained Asset Classes

| Path | Why it remains | Authority level |
|------|----------------|-----------------|
| `docs/implementation/README.md` | entrypoint that explains subtree status | supplemental only |
| `docs/implementation/ai-indexing-plans/*.md` | preserved planning and deep-dive design material that may still help when working directly on indexing internals | supplemental historical/reference context |
| `docs/implementation/ai-indexing-plans/schema/*.json` | preserved JSON schema artifacts adjacent to the planning docs | supplemental reference assets |
| non-Markdown assets elsewhere under `docs/implementation/` | retained only if not required to rebuild the numbered doc tree and not currently blocking runtime/tests | supplemental only |

## Guardrails

- Do not read this subtree before the numbered docs unless you specifically need a retained schema or artifact.
- If content under this subtree disagrees with `docs/01-*` through `docs/07-*`, the numbered docs and live source win.
- Treat `docs/implementation/ai-indexing-plans/` as supplemental material, not current-state authority.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `docs/README.md` | supporting-artifact status for the implementation subtree |
| source | `docs/05-operations/documentation-audit-ledger.md` | retention rationale for supplemental docs outside the numbered reading order |
| source | `docs/implementation/ai-indexing-plans/README.md` | subtree entrypoint and retained planning-doc framing |

## Related Documents

- [../README.md](../README.md) - current doc entrypoint and reading order.
- [../05-operations/documentation-audit-ledger.md](../05-operations/documentation-audit-ledger.md) - file-level audit dispositions for the maintained docs surface.
