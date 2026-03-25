import type { ReactNode } from 'react';
import { SidebarShell } from '../../../shared/ui/navigation/SidebarShell.tsx';
import { LLM_PHASES } from '../state/llmPhaseRegistry.generated.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';

interface LlmConfigPageShellProps {
  activePhase: LlmPhaseId;
  onSelectPhase: (phase: LlmPhaseId) => void;
  headerActions: ReactNode;
  activePanel: ReactNode;
  settingsScope?: 'default' | 'user';
}

const PHASE_ICON_PATHS: Record<string, ReactNode> = {
  global: <><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  needset: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h5" /></>,
  'brand-resolver': <><path d="M4 6h16M4 12h10M4 18h14" /><circle cx="18" cy="12" r="3" /></>,
  'search-planner': <><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></>,
  'serp-selector': <><path d="M3 6h18M3 12h12M3 18h8" /><path d="M19 10l2 2-2 2" /></>,
  validate: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
};

const DEFAULT_PHASE_ICON: ReactNode = <circle cx="12" cy="12" r="8" />;

function PhaseNavIcon({ phaseId, active }: { phaseId: LlmPhaseId; active: boolean }) {
  const toneClass = active ? 'sf-callout sf-callout-info' : 'sf-callout sf-callout-neutral';
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {PHASE_ICON_PATHS[phaseId] ?? DEFAULT_PHASE_ICON}
      </svg>
    </span>
  );
}

export function LlmConfigPageShell({
  activePhase,
  onSelectPhase,
  headerActions,
  activePanel,
  settingsScope,
}: LlmConfigPageShellProps) {
  const scopeBadge = settingsScope ? (
    <span
      className="sf-text-nano font-semibold uppercase tracking-wide"
      style={{
        color: settingsScope === 'default'
          ? 'rgb(var(--sf-color-accent-strong-rgb))'
          : 'var(--sf-state-success-fg)',
        backgroundColor: settingsScope === 'default'
          ? 'rgb(var(--sf-color-accent-strong-rgb) / 0.10)'
          : 'var(--sf-state-success-bg)',
        borderRadius: 'var(--sf-radius-chip)',
        padding: 'var(--sf-space-0-5) var(--sf-space-1-5)',
      }}
    >
      {settingsScope === 'default' ? 'Saves to Default Settings' : 'Saves to User Settings'}
    </span>
  ) : undefined;

  return (
    <SidebarShell
      title="LLM Configuration"
      items={LLM_PHASES}
      activeItem={activePhase}
      onSelect={onSelectPhase}
      renderIcon={(id, active) => <PhaseNavIcon phaseId={id} active={active} />}
      headerActions={headerActions}
      subtitleExtra={scopeBadge}
    >
      {activePanel}
    </SidebarShell>
  );
}
