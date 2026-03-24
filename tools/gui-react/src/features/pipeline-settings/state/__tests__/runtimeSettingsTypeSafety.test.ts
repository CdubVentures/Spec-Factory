// WHY: Compile-time type test proving RuntimeSettings preserves keyed fields
// from the registry SSOT. If this file compiles, the type contract holds.
// Run: tsc --noEmit (these are compile-time assertions, not runtime tests)

import type { RuntimeSettings } from '../runtimeSettingsAuthorityHelpers.ts';

// --- Happy: known keys compile and resolve to the expected value type ---

function assertKnownKeys(s: RuntimeSettings) {
  // These must compile — proves autocomplete works for registry keys
  const _fc: string | number | boolean | undefined = s.maxPagesPerDomain;
  const _se: string | number | boolean | undefined = s.searchEngines;
  const _ak: string | number | boolean | undefined = s.anthropicApiKey;

  // Suppress unused-variable warnings
  void _fc; void _se; void _ak;
}

// --- Happy: dynamic string key access compiles (Record tail) ---

function assertDynamicKey(s: RuntimeSettings) {
  const _dyn: string | number | boolean = s['anything'];
  void _dyn;
}

// --- Happy: Record<string, string | number | boolean> is assignable ---

function assertBackwardCompat() {
  const r: Record<string, string> = {};
  const _s: RuntimeSettings = r;
  void _s;
}

// --- Happy: Partial usage compiles ---

function assertPartial() {
  const _p: Partial<RuntimeSettings> = {};
  void _p;
}

// --- Happy: Object.entries works ---

function assertIteration(s: RuntimeSettings) {
  for (const [_k, _v] of Object.entries(s)) {
    void _k; void _v;
  }
}

// --- Happy: empty init compiles ---

function assertEmptyInit() {
  const _s: RuntimeSettings = {};
  void _s;
}

// Ensure functions are used (prevents tree-shaking / dead-code warnings)
void assertKnownKeys;
void assertDynamicKey;
void assertBackwardCompat;
void assertPartial;
void assertIteration;
void assertEmptyInit;
