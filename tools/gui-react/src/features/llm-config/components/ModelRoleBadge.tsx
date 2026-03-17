import { memo } from 'react';
import type { LlmModelRole } from '../types/llmProviderRegistryTypes';
import { ROLE_BADGE_STYLE, ROLE_ICON, ROLE_LABEL } from '../state/llmRoleBadgeStyles';

interface ModelRoleBadgeProps {
  role: LlmModelRole;
}

export const ModelRoleBadge = memo(function ModelRoleBadge({ role }: ModelRoleBadgeProps) {
  const style = ROLE_BADGE_STYLE[role];
  const icon = ROLE_ICON[role];
  return (
    <span
      className="inline-flex items-center gap-1 sf-text-caption font-medium"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderRadius: 'var(--sf-radius-chip)',
        padding: 'var(--sf-space-0-5) var(--sf-space-1-5)',
      }}
    >
      <svg
        width={icon.size}
        height={icon.size}
        viewBox={icon.viewBox}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={icon.d} />
      </svg>
      {ROLE_LABEL[role]}
    </span>
  );
});
