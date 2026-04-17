// WHY: TS-native mirror of src/shared/resolveEffortLabel.js.
// The shared JS module is the behavioral SSOT (tested in src/shared/tests/resolveEffortLabel.test.js).
// Rule: baked model-name suffix wins; otherwise configured effort only applies when thinking is on.
import { extractEffortFromModelName } from './llmEffortFromModelName.ts';

export interface ResolveEffortLabelInput {
  readonly model?: string | null;
  readonly effortLevel?: string | null;
  readonly thinking?: boolean | null;
}

export function resolveEffortLabel({ model, effortLevel, thinking }: ResolveEffortLabelInput = {}): string {
  const baked = extractEffortFromModelName(model ?? '');
  if (baked) return baked;
  return thinking ? String(effortLevel ?? '') : '';
}
