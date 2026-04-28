# Codegen Drift Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

Generated files are tracked, but there is no single regeneration entry point or CI guard proving generated outputs are current.

## Active Findings

### G1. No CI/pre-commit drift guard after codegen - HIGH

A registry can change without regenerated TypeScript being updated.

**Fix shape:** Add a validation command that runs generators and fails on `git diff --exit-code`, after explicit approval for script changes.

### G2. No root "regen all" entry point - MEDIUM

Developers must know individual generator scripts.

**Fix shape:** Add a root codegen script only with explicit approval for package script changes.

### G3. LLM phase generator is a super-generator - MEDIUM

One generator emits multiple outputs and effectively leads part of the codegen pipeline.

**Fix shape:** Document that role or split when it becomes hard to maintain.

### G4. Finder typegen has opt-in coverage - MEDIUM

Some finder types are generated, while future modules can fall into a two-tier model.

**Fix shape:** Decide between universal finder typegen or clearly documented opt-in criteria.

### G5. Some registries probably need generated consumers - LOW-MEDIUM

Event names and related registry constants still have string-literal usage risk.

**Fix shape:** Generate consumer constants when drift appears or when touching the registry pipeline.

### G6. `tsconfig.tsbuildinfo` is tracked - LOW

Build info churn can create noisy diffs.

**Fix shape:** Remove from tracking only with explicit cleanup approval.

### G7. Codegen script test coverage is sparse - LOW

Generators have limited smoke tests.

**Fix shape:** Add minimal smoke tests around generator output shape.

### G8. Broader generated-code checks are still needed before closing Registry/O(1) stage work - MEDIUM

Recent registry/O(1) items may be addressed locally, but stage closure still needs a broader generated-code drift check across all generated artifacts.

**Fix shape:** Run the agreed codegen/check sequence and inspect generated diffs before marking registry/O(1) stage work closed.

## Recommended Fix Order

1. **G1** - Codegen drift guard.
2. **G2** - Regenerate-all entry point.
3. **G8** - Broader generated-code checks before Registry/O(1) closure.
4. **G4/G5** - Registry/typegen coverage decisions.
5. **G7** - Generator smoke tests.
6. **G3/G6** - Cleanup/documentation.
