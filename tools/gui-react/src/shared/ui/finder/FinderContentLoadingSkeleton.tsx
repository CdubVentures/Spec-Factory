import { SkeletonBlock } from '../feedback/SkeletonBlock.tsx';

interface FinderContentLoadingSkeletonProps {
  readonly sections?: number;
  readonly rowsPerSection?: number;
}

const FINDER_KPI_CARDS = [
  { id: 'runs', label: 'Runs' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'published', label: 'Published' },
  { id: 'coverage', label: 'Coverage' },
] as const;
function range(length: number, prefix: string) {
  return Array.from({ length }, (_value, index) => `${prefix}-${index}`);
}

function KpiCardSkeleton({ card, label }: { readonly card: string; readonly label: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1"
      data-region="finder-content-loading-kpi-card"
      data-skeleton-card={card}
    >
      <div className="text-[28px] font-bold font-mono leading-none tracking-tight tabular-nums">
        <SkeletonBlock className="sf-skel-text-xl" />
      </div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
        {label}
      </div>
    </div>
  );
}

function HowItWorksSkeleton() {
  return (
    <div
      className="sf-surface-elevated border sf-border-soft rounded-lg"
      data-region="finder-content-loading-how-it-works"
    >
      <div className="w-full flex items-center gap-2.5 p-5">
        <span className="text-[10px] sf-text-muted shrink-0">{'\u25B6'}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          How It Works
        </span>
        <span className="ml-3 flex-1">
          <SkeletonBlock className="sf-skel-bar-label" />
        </span>
        <span className="sf-shimmer inline-block h-5 w-16 rounded-md shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

function SectionRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div
      className="rounded-lg border sf-border-soft sf-surface-panel p-3 flex items-center gap-3"
      data-region="finder-content-loading-row"
      data-skeleton-row={row}
    >
      <span className="sf-shimmer inline-block h-6 w-24 rounded-md shrink-0" aria-hidden="true" />
      <span className="sf-shimmer block h-3.5 flex-1 rounded-sm" aria-hidden="true" />
      <span className="sf-shimmer inline-block h-5 w-12 rounded-md shrink-0" aria-hidden="true" />
      <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
      <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
    </div>
  );
}

function SectionSkeleton({ section, rowsPerSection }: { readonly section: string; readonly rowsPerSection: number }) {
  return (
    <div
      className="sf-surface-elevated border sf-border-soft rounded-lg"
      data-region="finder-content-loading-section"
      data-skeleton-section={section}
    >
      <div className="w-full flex items-center gap-2.5 p-5">
        <span className="text-[10px] sf-text-muted shrink-0">{'\u25B6'}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          <SkeletonBlock className="sf-skel-bar-label" />
        </span>
        <span className="text-[10px] font-mono sf-text-subtle">
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <div className="flex-1" />
        <span className="sf-shimmer inline-block h-7 w-20 rounded-md shrink-0" aria-hidden="true" />
      </div>
      <div className="px-5 pb-5 flex flex-col gap-3">
        {range(rowsPerSection, section).map((row) => (
          <SectionRowSkeleton key={row} row={row} />
        ))}
      </div>
    </div>
  );
}

export function FinderContentLoadingSkeleton({
  sections = 2,
  rowsPerSection = 3,
}: FinderContentLoadingSkeletonProps) {
  return (
    <div
      className="px-6 pb-6 pt-4 space-y-5"
      data-testid="finder-content-loading-skeleton"
      data-region="finder-content-loading-body"
      aria-busy="true"
    >
      <span className="sr-only">Loading finder content</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {FINDER_KPI_CARDS.map((card) => (
          <KpiCardSkeleton key={card.id} card={card.id} label={card.label} />
        ))}
      </div>
      <HowItWorksSkeleton />
      {range(sections, 'section').map((section) => (
        <SectionSkeleton key={section} section={section} rowsPerSection={rowsPerSection} />
      ))}
    </div>
  );
}
