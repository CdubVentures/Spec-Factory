import type { ReactNode } from 'react';
import { SidebarShell } from '../../../shared/ui/navigation/SidebarShell';

export type PipelineSectionId = 'runtime-flow' | 'convergence' | 'source-strategy';

export const PIPELINE_SECTION_IDS = [
  'runtime-flow',
  'convergence',
  'source-strategy',
] as const satisfies readonly PipelineSectionId[];

const PIPELINE_SECTIONS = [
  {
    id: 'runtime-flow' as const,
    label: 'Runtime Flow',
    phase: '01-06',
    subtitle: 'Pipeline execution',
    tip: 'Owns the knobs that feed 01 NeedSet, 02 Brand Resolver, 03 Search Profile, 04 Search Planner, 05 Query Journey, 06 Search Results, 07 SERP Selector, 08 Fetch and Parse Entry, and 09 Fetch To Extraction. Search Planner is precomputed early from NeedSet, Search Profile is the deterministic and fallback profile branch, and Query Journey decides which branch reaches execution. Use this section when you need to change how discovery, fetch, browser fallback, parsing, or OCR behave before consensus begins.',
  },
  {
    id: 'convergence' as const,
    label: 'Scoring & Retrieval',
    phase: 'ALGO',
    subtitle: 'Consensus, SERP triage & retrieval weights',
    tip: 'Owns late ranking and scoring policy around 07 SERP Selector plus 11 Identity Gating To Consensus and 12 Consensus To Validation. Use it when the pipeline is keeping the wrong URLs, admitting weak evidence, or choosing the wrong final value during consensus.',
  },
  {
    id: 'source-strategy' as const,
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
  return (
    <SidebarShell
      title="Pipeline Settings"
      items={PIPELINE_SECTIONS}
      activeItem={activeSection}
      onSelect={onSelectSection}
      renderIcon={(id, active) => <SectionNavIcon id={id} active={active} />}
      headerActions={headerActions}
    >
      {activePanel}
    </SidebarShell>
  );
}
