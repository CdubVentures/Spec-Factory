import type { KpiCard } from './types.ts';
import { toneToValueClass } from './toneMappings.ts';

export function FinderKpiCard({ value, label, tone }: KpiCard) {
  return (
    <div className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1">
      <div className={`text-[28px] font-bold font-mono leading-none tracking-tight tabular-nums ${toneToValueClass(tone)}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
        {label}
      </div>
    </div>
  );
}
