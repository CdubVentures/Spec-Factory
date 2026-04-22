import type { CSSProperties } from 'react';
import './KpiTile.css';

export type KpiTileTone = 'good' | 'warn' | 'weak' | 'neutral';

export interface KpiTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly barPct?: number;
  readonly barTone?: KpiTileTone;
  readonly sub?: string;
}

export function KpiTile({ label, value, unit, barPct, barTone = 'neutral', sub }: KpiTileProps) {
  const clamped = typeof barPct === 'number'
    ? Math.max(0, Math.min(100, barPct))
    : undefined;
  const fillStyle: CSSProperties | undefined = clamped !== undefined
    ? ({ '--sf-kpi-fill-pct': `${clamped}%` } as CSSProperties)
    : undefined;

  return (
    <div className="sf-kpi-tile" data-tone={barTone}>
      <div className="sf-kpi-label">{label}</div>
      <div className="sf-kpi-value">
        {value}
        {unit ? <span className="sf-kpi-unit"> {unit}</span> : null}
      </div>
      {clamped !== undefined ? (
        <div className="sf-kpi-bar" aria-hidden="true">
          <div className="sf-kpi-bar-fill" style={fillStyle} />
        </div>
      ) : null}
      {sub ? <div className="sf-kpi-sub">{sub}</div> : null}
    </div>
  );
}
