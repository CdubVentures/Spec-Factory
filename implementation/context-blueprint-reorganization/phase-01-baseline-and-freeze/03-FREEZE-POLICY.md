# Phase 01 Freeze Policy

## Policy Start

Effective immediately for the reorganization track.

## Freeze Intent

Prevent additional coupling and structural drift while context contracts are defined.

## Allowed Changes

- Bug fixes that do not add new cross-domain dependencies.
- Test coverage additions.
- Documentation and planning artifacts.
- Small safety refactors inside existing boundaries.
- Navigation grouping/UI ordering corrections that do not change business behavior.

## Blocked Changes

- Net-new feature expansion in hotspot files.
- New cross-feature imports that bypass planned contracts.
- New generic helper dumping into shared utility buckets.
- Major route or payload contract changes without contract-phase approval.
- Large mixed-responsibility edits in composition roots.

## Freeze Surfaces (High Sensitivity)

- `src/cli/spec.js`
- `src/api/guiServer.js`
- `src/pipeline/runProduct.js`
- `src/ingest/categoryCompile.js`
- `src/db/specDb.js`
- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/indexing/IndexingPage.tsx`

## Exception Process

An exception must include:

1. Why delay is unacceptable.
2. Blast radius assessment.
3. Test plan proving no contract regression.
4. Follow-up task to fold change into target hierarchy.

## Enforcement

- Track all exceptions in `05-RISK-REGISTER.md`.
- Require test evidence for every exception.
- Reject change sets that increase cross-feature coupling without approval.
