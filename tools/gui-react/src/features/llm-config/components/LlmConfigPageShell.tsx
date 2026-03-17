import type { ReactNode } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip';
import { LLM_PHASES } from '../state/llmPhaseRegistry';
import type { LlmPhaseId } from '../types/llmPhaseTypes';

interface LlmConfigPageShellProps {
  activePhase: LlmPhaseId;
  onSelectPhase: (phase: LlmPhaseId) => void;
  headerActions: ReactNode;
  activePanel: ReactNode;
  settingsScope?: 'default' | 'user';
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
        {phaseId === 'global' && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          </>
        )}
        {phaseId === 'needset' && (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 8h8M8 12h5" />
          </>
        )}
        {phaseId === 'brand-resolver' && (
          <>
            <path d="M4 6h16M4 12h10M4 18h14" />
            <circle cx="18" cy="12" r="3" />
          </>
        )}
        {phaseId === 'search-planner' && (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="M16 16l5 5" />
          </>
        )}
        {phaseId === 'serp-triage' && (
          <>
            <path d="M3 6h18M3 12h12M3 18h8" />
            <path d="M19 10l2 2-2 2" />
          </>
        )}
        {phaseId === 'domain-classifier' && (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        )}
        {phaseId === 'extraction' && (
          <>
            <path d="M4 7h6l2 2h8" />
            <path d="M4 17h6l2-2h8" />
            <circle cx="12" cy="12" r="2" />
          </>
        )}
        {phaseId === 'validate' && (
          <>
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="9" />
          </>
        )}
        {phaseId === 'write' && (
          <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
          </>
        )}
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
  const activePhaseData = LLM_PHASES.find((p) => p.id === activePhase) ?? LLM_PHASES[0];

  return (
    <div
      className="flex h-full min-h-0 rounded overflow-hidden sf-shell border"
      style={{ borderColor: 'var(--sf-surface-border)' }}
    >
      <aside className="sf-sidebar w-60 shrink-0 min-h-0 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-3">
        <div
          className="mb-3 px-2 pt-1 sf-text-caption font-bold uppercase tracking-widest"
          style={{ color: 'var(--sf-muted)' }}
        >
          LLM Configuration
        </div>
        {LLM_PHASES.map((phase) => {
          const isActive = activePhase === phase.id;
          return (
            <button
              key={phase.id}
              onClick={() => onSelectPhase(phase.id)}
              className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isActive ? 'sf-nav-item-active' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <PhaseNavIcon phaseId={phase.id} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div
                    className="sf-text-label font-semibold leading-5"
                    style={{ color: isActive ? 'rgb(var(--sf-color-accent-strong-rgb))' : 'var(--sf-text)' }}
                  >
                    {phase.label}
                  </div>
                  <div className="sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
                    {phase.subtitle}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </aside>

      <div className="sf-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 space-y-4">
        <div
          className="flex items-start justify-between gap-4 pb-4 border-b"
          style={{ borderColor: 'var(--sf-surface-border)' }}
        >
          <div className="flex items-start gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                  {activePhaseData.label}
                </h2>
                <Tip text={activePhaseData.tip} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                  {activePhaseData.subtitle}
                </p>
                {settingsScope && (
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
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-3 shrink-0">{headerActions}</div>
        </div>
        {activePanel}
      </div>
    </div>
  );
}
