# Phase 06 - Frontend Feature Slicing

## Goal

Reorganize the GUI from page-centric modules to feature-centric slices.

## Entry Gate

- Phase 05 backend wave B must be complete.
- `phase-05-backend-wave-b/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).
- Phase 01 freeze policy and exception controls remain active.

## Summary

- Create frontend feature boundaries aligned to backend contexts.
- Break large pages into feature components, hooks, stores, and APIs.
- Move cross-cutting UI primitives to shared frontend modules.
- Keep route paths and user behavior stable during migration.

## Exit Criteria

- Feature directories own their page, state, and API interactions.
- Cross-feature imports use published feature contracts only.
- Key GUI persistence and propagation suites remain green.
