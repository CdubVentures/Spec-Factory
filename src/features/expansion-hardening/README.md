## Purpose
Own CLI-facing expansion bootstrap and hardening harness flows for category scaffolding, queue stress, fuzzing, and compliance reporting.
This feature packages operational hardening routines behind a single boundary instead of scattering them across CLI code.

## Public API (The Contract)
- `src/features/expansion-hardening/index.js`: `bootstrapExpansionCategories()`, `runQueueLoadHarness()`, `runFailureInjectionHarness()`, `runFuzzSourceHealthHarness()`, `runProductionHardeningReport()`, and `parseExpansionCategories()`.

## Dependencies
- Allowed: internal feature files, `src/field-rules/compiler.js`, `src/queue/queueState.js`, and `src/publish/publishingPipeline.js`.
- Forbidden: direct feature-to-feature imports beyond those existing operational seams.

## Domain Invariants
- Category tokens are normalized before scaffolding or harness execution.
- Bootstrap writes create missing local artifacts but do not overwrite existing scaffold files implicitly.
- Queue and fuzz harnesses operate through the queue/source-health seams instead of embedding duplicate runtime logic.
- CLI commands should call this feature contract rather than importing implementation details directly.

