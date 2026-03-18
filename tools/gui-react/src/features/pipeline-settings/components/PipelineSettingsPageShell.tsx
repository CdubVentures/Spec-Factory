import type { ReactNode } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip';

export type PipelineSectionId = 'runtime-flow' | 'convergence' | 'source-strategy';

export const PIPELINE_SECTION_IDS = [
  'runtime-flow',
  'convergence',
  'source-strategy',
] as const satisfies readonly PipelineSectionId[];

interface PipelineSection {
  id: PipelineSectionId;
  label: string;
  phase: string;
  subtitle: string;
  tip: string;
}

const PIPELINE_SECTIONS: PipelineSection[] = [
  {
    id: 'runtime-flow',
    label: 'Runtime Flow',
    phase: '01-06',
    subtitle: 'Pipeline execution',
    tip: 'Owns the knobs that feed 01 NeedSet, 02 Brand Resolver, 03 Search Profile, 04 Search Planner, 05 Query Journey, 06 Search Results, 07 SERP Triage, 08 Fetch and Parse Entry, and 09 Fetch To Extraction. Use this section when you need to change how discovery, fetch, browser fallback, parsing, or OCR behave before consensus begins.',
  },
  {
    // WHY: internal id kept as 'convergence' to avoid cross-file rename blast radius
    id: 'convergence',
    label: 'Scoring & Retrieval',
    phase: 'ALGO',
    subtitle: 'Consensus, SERP triage & retrieval weights',
    tip: 'Owns late ranking and scoring policy around 07 SERP Triage plus 11 Identity Gating To Consensus and 12 Consensus To Validation. Use it when the pipeline is keeping the wrong URLs, admitting weak evidence, or choosing the wrong final value during consensus.',
  },
  {
    id: 'source-strategy',
    label: 'Source Strategy',
    phase: 'SRCS',
    subtitle: 'Per-host source rules',
    tip: 'Owns the host registry consumed during 07 Planner Queue Seeding and 08 Fetch and Parse Entry. Use it to tell the planner which hosts are authoritative, how they should be crawled, and whether they should enter discovery as approved or candidate sources.',
  },
];

export function SectionNavIcon({ id, active }: { id: PipelineSectionId; active: boolean }) {
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
        {id === 'runtime-flow' && (
          <>
            <path d="M4 7h6l2 2h8" />
            <path d="M4 17h6l2-2h8" />
            <circle cx="4" cy="7" r="1.5" />
            <circle cx="4" cy="17" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <path d="M12 9.5v5" />
          </>
        )}
        {id === 'convergence' && (
          <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3.25" />
            <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4" />
          </>
        )}
        {id === 'source-strategy' && (
          <>
            <ellipse cx="12" cy="6" rx="7" ry="2.5" />
            <path d="M5 6v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5V6" />
            <path d="M5 11v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5v-5" />
            <path d="M3 18h4M17 18h4" />
          </>
        )}
      </svg>
    </span>
  );
}

interface PipelineSettingsPageShellProps {
  activeSection: PipelineSectionId;
  onSelectSection: (section: PipelineSectionId) => void;
  headerActions: ReactNode;
  activePanel: ReactNode;
}

export function PipelineSettingsPageShell({
  activeSection,
  onSelectSection,
  headerActions,
  activePanel,
}: PipelineSettingsPageShellProps) {
  const activeSectionData =
    PIPELINE_SECTIONS.find((section) => section.id === activeSection) ?? PIPELINE_SECTIONS[0];

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
          Pipeline Settings
        </div>
        {PIPELINE_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => onSelectSection(section.id)}
              className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isActive ? 'sf-nav-item-active' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <SectionNavIcon id={section.id} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div
                    className="sf-text-label font-semibold leading-5"
                    style={{ color: isActive ? 'rgb(var(--sf-color-accent-strong-rgb))' : 'var(--sf-text)' }}
                  >
                    {section.label}
                  </div>
                  <div className="sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
                    {section.subtitle}
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
                  {activeSectionData.label}
                </h2>
                <Tip text={activeSectionData.tip} />
              </div>
              <p className="mt-1 sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                {activeSectionData.subtitle}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-3 shrink-0">{headerActions}</div>
        </div>
        {activePanel}
      </div>
    </div>
  );
}
