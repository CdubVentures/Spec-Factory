# Phase 04 - Backend Migration Wave A

## Goal

Migrate stable backend contexts with lower orchestration risk first.

## Entry Gate

- Phase 03 composition roots must be split enough to support delegated feature modules.
- Phase 01 freeze policy and exception controls remain active.
- `phase-03-composition-root-split/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).

## Summary

- Move settings authority, catalog identity, and review curation into feature slices.
- Keep existing APIs stable via compatibility facades.
- Reduce generic `utils` usage by relocating helpers to owning contexts.
- Validate data authority and propagation contracts after each extraction step.

## Exit Criteria

- Selected contexts run through feature public APIs.
- No direct cross-feature internal imports in migrated areas.
- Targeted backend contract suites remain green.

## Status

- `COMPLETED` (internal audit checkpoint approved on 2026-03-02)
- Implementation progress: `04-01` settings-authority contract seed, `04-02` catalog-identity contract seed, `04-03` review-curation contract seed, and `04-04` Wave A guardrail closure/handoff all landed.
- Latest full quality gate: `npm test` (`3351/3351` passing; `210` suites).
- Next in-order action: begin `phase-05-backend-wave-b` execution.
