import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const BODY_LINES = ['line-0', 'line-1', 'line-2'] as const;

export function FinderPanelSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading finder panel"
      className="rounded-lg border border-sf-border-subtle bg-sf-surface-elevated/60 min-h-[200px] px-6 py-5 space-y-4"
      data-testid="finder-panel-skeleton"
    >
      <div className="flex items-center gap-3">
        <SkeletonBlock className="sf-skel-icon-action" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="sf-skel-title" />
          <SkeletonBlock className="sf-skel-bar-label" />
        </div>
        <span
          className="sf-shimmer inline-block h-9 w-9 rounded"
          data-region="finder-panel-skeleton-action"
          aria-hidden="true"
        />
        <span
          className="sf-shimmer inline-block h-9 w-24 rounded"
          data-region="finder-panel-skeleton-action"
          aria-hidden="true"
        />
      </div>
      <div className="space-y-2.5">
        {BODY_LINES.map((line) => (
          <div key={line} data-region="finder-panel-skeleton-body-line">
            <span className="sf-shimmer block h-3.5 w-full rounded-sm" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <span className="sf-shimmer block h-16 rounded-md" aria-hidden="true" />
        <span className="sf-shimmer block h-16 rounded-md" aria-hidden="true" />
        <span className="sf-shimmer block h-16 rounded-md" aria-hidden="true" />
      </div>
    </div>
  );
}
