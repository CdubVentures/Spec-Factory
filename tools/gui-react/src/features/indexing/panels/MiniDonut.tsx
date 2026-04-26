import { lazy, Suspense } from 'react';

interface MiniDonutProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
}

// WHY: Recharts is ~200KB. Lazy-load the donut implementation so the
// ProductHistoryPanel chrome (tabs, summary cards) renders without blocking
// on the chart bundle.
const MiniDonutInner = lazy(() => import('./MiniDonutInner.tsx'));

function MiniDonutFallback({ title }: { title: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4">
      <div className="text-[11px] font-semibold sf-text-muted uppercase tracking-wide mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <div className="w-[100px] h-[100px]" />
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
