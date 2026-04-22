// WHY: Pure helpers for the scope-locked ActionButton family. Extracted so the
// intent→className map, spinner-visibility rule, and click-block rule are
// unit-testable without a DOM. Both HeaderActionButton and RowActionButton
// consume these identically — they only differ in height/typography shell.

export type ActionButtonIntent =
  | 'spammable'
  | 'locked'
  | 'prompt'
  | 'history'
  | 'delete'
  | 'stop'
  | 'neutral';

const INTENT_CLASS_MAP: Record<ActionButtonIntent, string> = {
  spammable: 'sf-primary-button',
  locked: 'sf-action-button',
  prompt: 'sf-prompt-preview-button',
  history: 'sf-history-button',
  delete: 'sf-delete-button',
  stop: 'sf-danger-button-solid',
  neutral: 'sf-neutral-button',
};

const LOCKING_INTENTS = new Set<ActionButtonIntent>(['locked', 'stop']);

export function resolveIntentClassName(intent: ActionButtonIntent): string {
  return INTENT_CLASS_MAP[intent];
}

export function shouldShowSpinner(intent: ActionButtonIntent, busy: boolean): boolean {
  return LOCKING_INTENTS.has(intent) && busy === true;
}

export function shouldBlockClick(
  intent: ActionButtonIntent,
  busy: boolean,
  disabled: boolean,
): boolean {
  if (disabled) return true;
  if (LOCKING_INTENTS.has(intent) && busy) return true;
  return false;
}
