# Field Rules Studio Docs

This directory is the canonical home for Field Rules Studio implementation docs, contracts, and audits.

## Layout

- `implementation/field-rules-studio/contracts/`
  - Field Studio contract architecture, hierarchy diagrams, and gate-audit docs.
- `implementation/field-rules-studio/audits/`
  - Time-stamped audit evidence, compile/runtime trace audits, and key-authority artifacts.
- `implementation/field-rules-studio/test-contract-map.md`
  - Mapping of contract surfaces to source modules and test coverage.

## Naming and path policy

- Use `field_studio` terminology for source/map contracts.
- Prefer date-prefixed audit filenames for chronological readability.
- Keep legacy terms only when quoting historical evidence.

## Primary entry points

- Contract architecture:
  - `implementation/field-rules-studio/contracts/component-system-architecture.md`
- Test-to-contract coverage map:
  - `implementation/field-rules-studio/test-contract-map.md`
- Latest full audit set:
  - `implementation/field-rules-studio/audits/2026-02-25-full-compile-generated-test-compiler-audit-rerun.md`
