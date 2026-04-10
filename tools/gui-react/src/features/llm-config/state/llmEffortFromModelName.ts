// WHY: TS-native copy of src/shared/effortFromModelName.js.
// The shared JS module is the behavioral SSOT (used by backend routing.js).
// This copy keeps the TS build self-contained. Both are tested against the
// same contract (src/shared/tests/effortFromModelName.test.js).
const EFFORT_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);

export function extractEffortFromModelName(modelName: string | null | undefined): string | null {
  const s = String(modelName ?? '').trim().toLowerCase();
  if (!s) return null;
  for (const sep of ['-', '_']) {
    for (const effort of EFFORT_LEVELS) {
      if (s.endsWith(sep + effort)) return effort;
    }
  }
  return null;
}
