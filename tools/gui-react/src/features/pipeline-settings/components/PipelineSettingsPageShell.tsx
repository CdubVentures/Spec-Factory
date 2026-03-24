import type { ReactNode } from 'react';
import { SidebarShell } from '../../../shared/ui/navigation/SidebarShell';

export type PipelineSectionId =
  | 'flow'
  | 'planner'
  | 'fetcher'
  | 'extraction'
  | 'validation'
  | 'convergence'
  | 'source-strategy';

export const PIPELINE_SECTION_IDS = [
  'flow',
  'planner',
  'fetcher',
  'extraction',
  'validation',
  'convergence',
  'source-strategy',
] as const satisfies readonly PipelineSectionId[];

const PIPELINE_SECTIONS = [
  {
    id: 'flow' as const,
    label: 'Runtime Flow',
    subtitle: 'Run setup, timeouts, budgets, resume, output config',
    tip: 'Owns run lifecycle knobs: timeouts, resume mode, output destinations, cloud mirrors, storage paths, automation helpers, and observability controls.',
  },
  {
    id: 'planner' as const,
    label: 'Runtime Planner',
    subtitle: 'Discovery, search engines, query caps, NeedSet tuning',
    tip: 'Owns discovery and search planning knobs: engine selection, query caps, URL budgets, domain limits, planner LLM settings, and network identity.',
  },
  {
    id: 'fetcher' as const,
    label: 'Runtime Fetcher',
    subtitle: 'Throughput, frontier, browser, screenshots, pacing',
    tip: 'Owns fetch-layer knobs: concurrency, host pacing, frontier persistence, cooldowns, browser fallback, headless mode, scroll behavior, and screenshot capture.',
  },
  {
    id: 'extraction' as const,
    label: 'Runtime Extraction',
    subtitle: 'LLM providers, models, tokens, budgets',
    tip: 'Owns extraction-layer knobs: LLM provider selection, API keys, model assignments, token limits, reasoning mode, call limits, cost budgets, cache, and advanced overrides.',
  },
  {
    id: 'validation' as const,
    label: 'Runtime Validation',
    subtitle: 'Schema enforcement and quality gates',
    tip: 'Owns pipeline validation knobs: schema enforcement mode for pipeline context checkpoints.',
  },
  {
    id: 'convergence' as const,
    label: 'Scoring & Retrieval',
    subtitle: 'Consensus, SERP triage & retrieval weights',
    tip: 'Owns late ranking and scoring policy around SERP Selector plus Identity Gating To Consensus and Consensus To Validation. Use it when the pipeline is keeping the wrong URLs, admitting weak evidence, or choosing the wrong final value during consensus.',
  },
  {
    id: 'source-strategy' as const,
    label: 'Source Strategy',
    subtitle: 'Per-host source rules',
    tip: 'Owns the host registry consumed during Planner Queue Seeding and Fetch and Parse Entry. Use it to tell the planner which hosts are authoritative, how they should be crawled, and whether they should enter discovery as approved or candidate sources.',
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
        {/* Flow — branching pipeline */}
        {id === 'flow' && (
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
        {/* Extraction — beaker */}
        {id === 'extraction' && (
          <>
            <path d="M9 3h6M10 3v5l-4 8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l-4-8V3" />
            <path d="M8.5 14h7" />
          </>
        )}
        {/* Validation — checkmark shield */}
        {id === 'validation' && (
          <>
            <path d="M12 3 4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7z" />
            <path d="m9 12 2 2 4-4" />
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
