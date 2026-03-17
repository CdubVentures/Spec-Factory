import { memo } from 'react';
import type { LlmModelRole } from '../types/llmProviderRegistryTypes';
import { ROLE_BADGE_STYLE } from '../state/llmRoleBadgeStyles';

const ROLE_ICON: Record<LlmModelRole, { d: string; viewBox: string }> = {
  primary: { d: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', viewBox: '0 0 12 12' },
  fast: { d: 'M7 1 3 7h3L5 13l5-6H7L9 1Z', viewBox: '0 0 14 14' },
  reasoning: { d: 'M6 1 1 6l5 5 5-5L6 1Z', viewBox: '0 0 12 12' },
  embedding: { d: 'M6 1v10M1 6h10', viewBox: '0 0 12 12' },
};

const ROLE_LABEL: Record<LlmModelRole, string> = {
  primary: 'Primary',
  fast: 'Fast',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
};

interface ModelRoleBadgeProps {
  role: LlmModelRole;
}

export const ModelRoleBadge = memo(function ModelRoleBadge({ role }: ModelRoleBadgeProps) {
  const style = ROLE_BADGE_STYLE[role];
  const icon = ROLE_ICON[role];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 sf-text-caption font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      <svg
        width="10"
        height="10"
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
