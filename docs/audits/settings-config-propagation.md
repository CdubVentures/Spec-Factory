# Settings / Config Live UI Propagation Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

`module-settings-updated` and threshold reconciliation now reach downstream consumers. Remaining issues are cross-tab timing, explicit freshness, and future maintainability.

## Active Findings

### G1. LLM policy edits propagate to other tabs only after save - MEDIUM
**File:** `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts`

The editor updates local state immediately, but cross-window propagation waits for save success. Other tabs can show stale LLM policy values during the request window.

**Fix shape:** Publish settings propagation optimistically on local update and rollback/refetch on save error.

### G2. Settings queries rely on implicit stale-time defaults - LOW
**Files:** `moduleSettingsAuthority.ts`, `useLlmPolicyAuthority.ts`, `runtimeSettingsAuthorityHooks.ts`

Settings reads do not consistently declare freshness policy. This makes cross-window behavior depend on global React Query defaults.

**Fix shape:** Add explicit small or zero `staleTime` values where settings are edited live.

### G3. No central knob-consumer registry - LOW

The system has module scope metadata, but no registry of which UI/query consumers depend on each knob. Future settings can drift from invalidation coverage.

**Fix shape:** Add consumer annotations to the settings registry/codegen path if more knob-driven UI surfaces are added.

## Recommended Fix Order

1. **G1** - Optimistic LLM policy propagation.
2. **G2** - Explicit settings query freshness.
3. **G3** - Knob-consumer registry only when more propagation drift appears.
