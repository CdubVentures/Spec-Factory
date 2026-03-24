// WHY: Resume settings (resumeMode, resumeWindowHours) have been retired from
// the registry. This module is preserved as an empty shell to avoid breaking
// imports. The deriveRunControlPayload function now returns an empty object.

export function deriveRunControlPayload(_input: Record<string, unknown>) {
  return {};
}
