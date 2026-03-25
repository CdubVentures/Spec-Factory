import type { ReactNode } from 'react';
import { SidebarShell } from '../../../shared/ui/navigation/SidebarShell.tsx';

export type PipelineSectionId =
  | 'global'
  | 'planner'
  | 'fetcher'
  | 'extraction'
  | 'validation'
  | 'source-strategy'
  | 'deterministic-strategy';

export const PIPELINE_SECTION_IDS = [
  'global',
  'planner',
  'fetcher',
  'extraction',
  'validation',
  'source-strategy',
  'deterministic-strategy',
] as const satisfies readonly PipelineSectionId[];

const PIPELINE_SECTIONS = [
  {
    id: 'global' as const,
    label: 'Global',
    subtitle: 'Run setup, timeouts, output config',
    tip: 'Top-level run lifecycle: timeouts, output destinations, storage paths, and automation helpers.',
  },
  {
    id: 'planner' as const,
    label: 'Runtime Planner',
    subtitle: 'Pipeline phase settings: NeedSet through Domain Classifier',
    tip: 'Per-phase knobs for the 8-stage search pipeline: NeedSet confidence, search profile caps, provider pacing, SERP selector budgets, and domain classifier limits.',
  },
  {
    id: 'fetcher' as const,
    label: 'Runtime Fetcher',
    subtitle: 'Browser, network, frontier, pacing, observability',
    tip: 'Fetch-layer knobs: adapter selection, concurrency, host pacing, frontier persistence, cooldowns, headless mode, scroll behavior, and observability (trace, screencast).',
  },
  {
    id: 'extraction' as const,
    label: 'Runtime Extraction',
    subtitle: 'Screenshots and page capture',
    tip: 'Page capture settings: screenshot format, quality, selectors, and size limits.',
  },
  {
    id: 'validation' as const,
    label: 'Runtime Validation',
    subtitle: 'Schema enforcement and quality gates',
    tip: 'Pipeline validation knobs: schema enforcement mode for pipeline context checkpoints.',
  },
  {
    id: 'source-strategy' as const,
    label: 'Source Strategy',
    subtitle: 'Per-host source rules',
    tip: 'Owns the host registry consumed during Planner Queue Seeding and Fetch and Parse Entry. Use it to tell the planner which hosts are authoritative, how they should be crawled, and whether they should enter discovery as approved or candidate sources.',
  },
  {
    id: 'deterministic-strategy' as const,
    label: 'Deterministic Strategy',
    subtitle: 'Per-category spec seed templates',
    tip: 'Ordered list of specification seed query templates per category. These replace the single hardcoded "specifications" query in Tier 1 query generation.',
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
        {/* Global — branching pipeline */}
        {id === 'global' && (
          <>
            <path d="M4 7h6l2 2h8" />
            <path d="M4 17h6l2-2h8" />
            <circle cx="4" cy="7" r="1.5" />
            <circle cx="4" cy="17" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <path d="M12 9.5v5" />
          </>
        )}
        {/* Planner — compass rose */}
        {id === 'planner' && (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
            <path d="m10 10 4 2-4 2z" fill="currentColor" />
          </>
        )}
        {/* Fetcher — download arrow */}
        {id === 'fetcher' && (
          <>
            <path d="M12 4v12" />
            <path d="m8 12 4 4 4-4" />
            <path d="M4 18h16" />
          </>
        )}
        {/* Extraction — camera/capture */}
        {id === 'extraction' && (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M7 5V3h4v2" />
          </>
        )}
        {/* Validation — checkmark shield */}
        {id === 'validation' && (
          <>
            <path d="M12 3 4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7z" />
            <path d="m9 12 2 2 4-4" />
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
        {id === 'deterministic-strategy' && (
          <>
            <path d="M4 6h16M4 10h16M4 14h10" />
            <circle cx="19" cy="14" r="2.5" />
            <path d="M19 17v3" />
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
