import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';

/**
 * Suspense fallback for lazy-loaded finder panels. Reserves roughly one
 * panel-header height so switching tabs doesn't cause a layout jump before
 * the lazy chunk finishes loading.
 */
export function FinderPanelSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading finder panel"
      className="flex items-center gap-3 px-6 py-5 rounded-lg border border-sf-border-subtle bg-sf-surface-elevated/60 min-h-[72px]"
    >
      <Spinner />
      <span className="text-caption sf-text-muted">Loading finder…</span>
    </div>
  );
}
