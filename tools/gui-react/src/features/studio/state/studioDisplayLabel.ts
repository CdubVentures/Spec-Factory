import { humanizeField } from '../../../utils/fieldNormalize.ts';

export function displayLabel(
  key: string,
  rule?: Record<string, unknown> | null,
): string {
  if (!rule) return humanizeField(key);
  const ui =
    rule.ui && typeof rule.ui === 'object'
      ? (rule.ui as Record<string, unknown>)
      : {};
  return String(ui.label || rule.label || humanizeField(key));
}
