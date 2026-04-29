import { lazy, Suspense } from 'react';

interface MiniDonutProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
}

// WHY: Recharts is ~200KB. Lazy-load the donut implementation so the
// ProductHistoryPanel chrome (tabs, summary cards) renders without blocking
// on the chart bundle.
const MiniDonutInner = lazy(() => import('./MiniDonutInner.tsx'));

// WHY: Mirrors MiniDonutInner's loaded shape — same card chrome, same title,
// same 100×100 donut slot, same vertical legend column (4 placeholder rows).
// Real donut count varies (legend rows = data.length), so 4 is a typical
// budget; when real data arrives the count adjusts but the overall shape
// stays consistent with the placeholder.
function MiniDonutFallback({ title }: { title: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4" aria-hidden="true">
      <div className="text-[11px] font-semibold sf-text-muted uppercase tracking-wide mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <span className="sf-shimmer rounded-full block shrink-0" style={{ width: 100, height: 100 }} />
        <div className="space-y-1.5 min-w-0 flex-1">
          {Array.from({ length: 4 }, (_value, index) => (
            <div key={index} className="flex items-center gap-1.5 text-[11px]">
              <span className="sf-shimmer w-2.5 h-2.5 rounded-sm shrink-0" />
              <span className="sf-shimmer block h-[11px] w-full rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MiniDonut(props: MiniDonutProps) {
  return (
    <Suspense fallback={<MiniDonutFallback title={props.title} />}>
      <MiniDonutInner {...props} />
    </Suspense>
  );
}
