/**
 * FinderRunModelBadge — shared badge for displaying LLM model info in finder
 * run history rows. Shows access mode SVG icon + capability icons + model name + effort tag.
 *
 * WHY: All finder run/eval history rows need identical badge rendering.
 * Shared component avoids duplication per O(1) scaling rule.
 */

import { memo } from 'react';
import { resolveEffortLabel } from '../../../features/llm-config/state/resolveEffortLabel.ts';
import { displayModelName } from './displayModelName.ts';

interface FinderRunModelBadgeProps {
  /** Model name as persisted in the run record (e.g. "gpt-5.4-xhigh"). */
  readonly model: string;
  /** Access mode persisted with the run. Empty/undefined = unknown (legacy). */
  readonly accessMode?: string;
  /** Effort level persisted with the run. Empty/undefined = derive from model name. */
  readonly effortLevel?: string;
  /** Whether a fallback model was used. */
  readonly fallbackUsed?: boolean;
  /** Whether thinking was enabled for this run. */
  readonly thinking?: boolean;
  /** Whether web search was enabled for this run. */
  readonly webSearch?: boolean;
  /** Optional disambiguation label shown as a leading pill (e.g. "PIF", "EVAL"). */
  readonly labelPrefix?: string;
}

const ICON_SIZE = 9;

function ApiIconMini() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1v2M8 13v2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M1 8h2M13 8h2M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

function LabIconMini() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 1v5L2 14h12L10 6V1" />
      <path d="M5 1h6" />
      <path d="M4.5 11h7" />
    </svg>
  );
}

/** WHY: Matches the ThinkingIcon from ModelAccessBadges.tsx at mini scale. */
function ThinkingIconMini() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 9.5C3.5 8.5 2 6.5 2 4.5A4.5 4.5 0 0 1 11 4.5c0 2-1.5 4-3.5 5" />
      <path d="M5.5 9.5v2a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-2" />
      <circle cx="12.5" cy="3" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** WHY: Matches the WebSearchIcon from ModelAccessBadges.tsx at mini scale. */
function WebSearchIconMini() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" />
      <ellipse cx="7" cy="7" rx="2.2" ry="5.5" />
      <path d="M1.5 7h11" />
      <path d="M2.5 4h9M2.5 10h9" />
    </svg>
  );
}

/** Effort label style — small uppercase pill inline with the model name. */
const EFFORT_STYLE: React.CSSProperties = {
  fontSize: '8px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  padding: '0 3px',
  borderRadius: '2px',
  lineHeight: '14px',
};

export const FinderRunModelBadge = memo(function FinderRunModelBadge({
  model,
  accessMode,
  effortLevel,
  fallbackUsed,
  thinking,
  webSearch,
  labelPrefix,
}: FinderRunModelBadgeProps) {
  if (!model) return null;

  // WHY: Baked model-name suffix always shows; configured effort only when thinking is on.
  // This also masks historical rows that persisted a config effort while thinking was off.
  const resolvedEffort = resolveEffortLabel({ model, effortLevel, thinking });

  const hasAccessMode = accessMode === 'lab' || accessMode === 'api';
  const isLab = accessMode === 'lab';

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold sf-chip-neutral">
      {labelPrefix && (
        <span
          style={{
            ...EFFORT_STYLE,
            color: 'var(--sf-token-accent-strong)',
            backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.15)',
          }}
        >
          {labelPrefix.toUpperCase()}
        </span>
      )}
      {hasAccessMode && (
        <span
          className="inline-flex items-center"
          style={{ color: isLab ? 'var(--sf-state-run-ai-fg)' : 'rgb(var(--sf-color-text-muted-rgb))' }}
          title={isLab ? 'LLM Lab' : 'Cloud API'}
        >
          {isLab ? <LabIconMini /> : <ApiIconMini />}
        </span>
      )}
      {thinking && (
        <span
          className="inline-flex items-center"
          style={{ color: 'var(--sf-state-run-ai-fg)' }}
          title="Thinking enabled"
        >
          <ThinkingIconMini />
        </span>
      )}
      {webSearch && (
        <span
          className="inline-flex items-center"
          style={{ color: 'var(--sf-state-success-fg)' }}
          title="Web search enabled"
        >
          <WebSearchIconMini />
        </span>
      )}
      <span>{displayModelName(model)}</span>
      {resolvedEffort && (
        <span
          style={{
            ...EFFORT_STYLE,
            color: 'var(--sf-state-run-ai-fg)',
            backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.10)',
          }}
        >
          {resolvedEffort.toUpperCase()}
        </span>
      )}
      {fallbackUsed && (
        <span className="sf-chip-warning" style={{ ...EFFORT_STYLE, padding: '0 3px' }}>
          FB
        </span>
      )}
    </span>
  );
});
