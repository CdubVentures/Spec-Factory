# Phase 07 - Enforcement and Cutover

## Goal

Finalize the reorganization and enforce architecture rules as default.

## Entry Gate

- Phase 06 frontend feature slicing must be complete.
- `phase-06-frontend-feature-slicing/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).
- Phase 01 freeze policy and exception controls remain active.

## Summary

- Turn boundary checks from advisory to blocking in CI.
- Remove temporary compatibility shims no longer needed.
- Update canonical docs and operating playbooks for new structure.
- Run full regression and selected end-to-end validation.

## Exit Criteria

- Architecture rules are enforced in CI.
- Migration compatibility layers are cleaned up or tracked.
- Full validation run passes with no functional regression.
