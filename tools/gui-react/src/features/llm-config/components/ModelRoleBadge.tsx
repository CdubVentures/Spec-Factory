import { memo } from 'react';
import type { LlmModelRole } from '../types/llmProviderRegistryTypes.ts';
import { ROLE_BADGE_STYLE, ROLE_LABEL } from '../state/llmRoleBadgeStyles.ts';

interface ModelRoleBadgeProps {
  role: LlmModelRole;
}

export const ModelRoleBadge = memo(function ModelRoleBadge({ role }: ModelRoleBadgeProps) {
  const style = ROLE_BADGE_STYLE[role];
  return (
    <span
      className="inline-flex items-center sf-text-caption font-medium"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderRadius: 'var(--sf-radius-chip)',
        padding: 'var(--sf-space-0-5) var(--sf-space-1-5)',
      }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
});
