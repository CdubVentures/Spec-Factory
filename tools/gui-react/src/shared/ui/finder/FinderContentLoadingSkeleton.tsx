import { SkeletonBlock } from '../feedback/SkeletonBlock.tsx';

interface FinderContentLoadingSkeletonProps {
  readonly sections?: number;
  readonly rowsPerSection?: number;
}

const FINDER_KPI_CARDS = ['runs', 'candidates', 'published', 'coverage'] as const;

function range(length: number, prefix: string) {
  return Array.from({ length }, (_value, index) => `${prefix}-${index}`);
}

function KpiCardSkeleton({ card }: { readonly card: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1"
      data-region="finder-content-loading-kpi-card"
      data-skeleton-card={card}
    >
      <div className="text-[28px] font-bold font-mono leading-none tracking-tight tabular-nums">
        <SkeletonBlock className="sf-skel-title" />
      </div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
        <SkeletonBlock className="sf-skel-caption" />
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
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <span className="text-[10px] sf-text-subtle">
          <SkeletonBlock className="sf-skel-bar" />
        </span>
      </div>
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
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <span className="text-[10px] font-mono sf-text-subtle">
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <div className="flex-1" />
      </div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {range(rowsPerSection, section).map((row) => (
          <div
            key={row}
            className="rounded-lg border sf-border-soft sf-surface-panel p-3"
            data-region="finder-content-loading-row"
            data-skeleton-row={row}
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="sf-skel-caption" />
              <SkeletonBlock className="sf-skel-bar" />
              <SkeletonBlock className="sf-skel-caption" />
            </div>
          </div>
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
          <KpiCardSkeleton key={card} card={card} />
        ))}
      </div>
      <HowItWorksSkeleton />
      {range(sections, 'section').map((section) => (
        <SectionSkeleton key={section} section={section} rowsPerSection={rowsPerSection} />
      ))}
    </div>
  );
}
