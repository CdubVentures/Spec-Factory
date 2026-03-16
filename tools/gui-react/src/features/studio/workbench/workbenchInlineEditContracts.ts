const WORKBENCH_INLINE_EDIT_PATHS: Record<string, string> = {
  requiredLevel: 'priority.required_level',
  parseTemplate: 'parse.template',
  enumPolicy: 'enum.policy',
  publishGate: 'priority.publish_gate',
  aiMode: 'ai_assist.mode',
  aiModelStrategy: 'ai_assist.model_strategy',
  aiMaxCalls: 'ai_assist.max_calls',
};

export function resolveWorkbenchInlineEditPath(column: string) {
  return WORKBENCH_INLINE_EDIT_PATHS[String(column || '').trim()] || '';
}
