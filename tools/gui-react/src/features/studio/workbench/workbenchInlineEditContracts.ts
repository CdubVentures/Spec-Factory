const WORKBENCH_INLINE_EDIT_PATHS: Record<string, string> = {
  requiredLevel: 'priority.required_level',
  enumPolicy: 'enum.policy',
};

export function resolveWorkbenchInlineEditPath(column: string) {
  return WORKBENCH_INLINE_EDIT_PATHS[String(column || '').trim()] || '';
}
