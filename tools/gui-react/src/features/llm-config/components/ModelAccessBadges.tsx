import { memo } from 'react';
import { ACCESS_MODE_BADGE_STYLE, ROLE_ICON_STYLE } from '../state/llmRoleBadgeStyles.ts';
import type { LlmAccessMode, LlmModelRole } from '../types/llmProviderRegistryTypes.ts';

const ICON_SIZE = 10;

function ApiIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1v2M8 13v2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M1 8h2M13 8h2M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

function LabIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 1v5L2 14h12L10 6V1" />
      <path d="M5 1h6" />
      <path d="M4.5 11h7" />
    </svg>
  );
}

function PrimaryIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 1L4 9h4l-1 6L13 7H9l.5-6Z" />
    </svg>
  );
}

function ReasoningIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5C2.2 9.3 1 7.3 1 5a5 5 0 0 1 10 0c0 2.3-1.2 4.3-3 5.5" />
      <path d="M4 10.5V13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5" />
      <path d="M5 15h4" />
    </svg>
  );
}

interface ModelBadgeGroupProps {
  accessMode?: LlmAccessMode;
  role?: LlmModelRole;
}

export const ModelBadgeGroup = memo(function ModelBadgeGroup({
  accessMode,
  role,
}: ModelBadgeGroupProps) {
  const modeStyle = accessMode ? ACCESS_MODE_BADGE_STYLE[accessMode] : ACCESS_MODE_BADGE_STYLE.api;
  const roleStyle = role ? ROLE_ICON_STYLE[role] : null;

  return (
    <>
      <span
        className="sf-custom-select-badge"
        style={{ color: modeStyle.fg, backgroundColor: modeStyle.bg }}
        title={accessMode === 'lab' ? 'LLM Lab (local)' : 'Cloud API'}
      >
        {accessMode === 'lab' ? <LabIcon /> : <ApiIcon />}
        <span>{modeStyle.label}</span>
      </span>
      {roleStyle && (
        <span
          className="sf-custom-select-badge"
          style={{ color: roleStyle.fg, backgroundColor: roleStyle.bg }}
          title={roleStyle.title}
        >
          {role === 'reasoning' ? <ReasoningIcon /> : <PrimaryIcon />}
        </span>
      )}
    </>
  );
});
