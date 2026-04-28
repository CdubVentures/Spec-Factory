import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

/**
 * Suspense fallback for lazy-loaded finder panels. Reserves roughly one
 * panel-header height so switching tabs does not cause a layout jump before
 * the lazy chunk finishes loading.
 */
export function FinderPanelSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading finder panel"
      className="rounded-lg border border-sf-border-subtle bg-sf-surface-elevated/60 min-h-[72px] px-6 py-5 space-y-4"
      data-testid="finder-panel-skeleton"
    >
      <div className="flex items-center gap-3">
        <SkeletonBlock className="sf-skel-icon-action" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="sf-skel-caption" />
          <SkeletonBlock className="sf-skel-bar" />
        </div>
        <button type="button" className="sf-icon-button rounded px-3 py-1.5" data-region="finder-panel-skeleton-action" disabled>
          <SkeletonBlock className="sf-skel-caption" />
        </button>
        <button type="button" className="sf-primary-button rounded px-3 py-1.5" data-region="finder-panel-skeleton-action" disabled>
          <SkeletonBlock className="sf-skel-caption" />
        </button>
      </div>
      <div className="space-y-2">
        {['primary', 'secondary', 'tertiary'].map((line) => (
          <div key={line} data-region="finder-panel-skeleton-body-line">
            <SkeletonBlock className="sf-skel-bar" />
          </div>
        ))}
      </div>
    </div>
  );
}
