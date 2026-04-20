import type { ReactNode } from 'react';
import { SidebarShell } from '../../../shared/ui/navigation/SidebarShell.tsx';
import { LLM_PHASES, LLM_PHASE_GROUP_LABELS } from '../state/llmPhaseRegistry.generated.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';
import type { LlmPhaseGroup } from '../types/llmPhaseTypes.generated.ts';

interface LlmConfigPageShellProps {
  activePhase: LlmPhaseId;
  onSelectPhase: (phase: LlmPhaseId) => void;
  headerActions: ReactNode;
  activePanel: ReactNode;
  settingsScope?: 'default' | 'user';
}

const PHASE_ICON_PATHS: Record<string, ReactNode> = {
  global: <><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  writer: <><path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" /><path d="M14 6l3 3" /></>,
  needset: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h5" /></>,
  'brand-resolver': <><path d="M4 6h16M4 12h10M4 18h14" /><circle cx="18" cy="12" r="3" /></>,
  'search-planner': <><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></>,
  'serp-selector': <><path d="M3 6h18M3 12h12M3 18h8" /><path d="M19 10l2 2-2 2" /></>,
  validate: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
  'color-finder': <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" /></>,
};

const DEFAULT_PHASE_ICON: ReactNode = <circle cx="12" cy="12" r="8" />;

/* ── SVG group badges — small pill overlays in top-right of each sidebar button ── */

// WHY: Badge colors match the group's semantic intent:
// indexing = blue (pipeline flow), publish = green (validation/approval), discovery = purple (exploration)
const GROUP_BADGE_CONFIG: Record<string, { color: string; bg: string; icon: ReactNode; label: string }> = {
  indexing: {
    color: 'rgb(59, 130, 246)',
    bg: 'rgb(59, 130, 246, 0.12)',
    label: 'Pipeline',
    icon: (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6h3M7 6h3M5 4l2 2-2 2" />
      </svg>
    ),
  },
  publish: {
    color: 'rgb(34, 197, 94)',
    bg: 'rgb(34, 197, 94, 0.12)',
    label: 'Publish',
    icon: (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6.5l2 2 4-4" />
      </svg>
    ),
  },
  discovery: {
    color: 'rgb(168, 85, 247)',
    bg: 'rgb(168, 85, 247, 0.12)',
    label: 'Feature',
    icon: (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="4" />
        <path d="M6 2v1M6 9v1M2 6h1M9 6h1" />
      </svg>
    ),
  },
};

function GroupBadge({ group }: { group: LlmPhaseGroup }) {
  const config = GROUP_BADGE_CONFIG[group];
  if (!config) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5"
      style={{ color: config.color, fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em' }}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

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

// WHY: Enrich each phase with a badge ReactNode based on its group.
// Computed once — LLM_PHASES is frozen/static.
const PHASES_WITH_BADGES = LLM_PHASES.map((phase) => ({
  ...phase,
  badge: phase.group !== 'global' ? <GroupBadge group={phase.group} /> : undefined,
}));

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
      items={PHASES_WITH_BADGES}
      activeItem={activePhase}
      onSelect={onSelectPhase}
      renderIcon={(id, active) => <PhaseNavIcon phaseId={id} active={active} />}
      headerActions={headerActions}
      subtitleExtra={scopeBadge}
      groupLabels={LLM_PHASE_GROUP_LABELS}
    >
      {activePanel}
    </SidebarShell>
  );
}
