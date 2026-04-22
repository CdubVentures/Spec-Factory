import type { CSSProperties } from 'react';
import { deriveAmbiguityMarkerPct } from '../../../features/indexing/selectors/ambiguityMarker.ts';
import './AmbiguityMeter.css';

export interface AmbiguityMeterProps {
  readonly level: string;
  readonly familyCount: number;
  readonly label?: string;
}

const LEVEL_LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  very_hard: 'Very hard',
  extra_hard: 'Extra hard',
  unknown: 'Unknown',
};

const LEVEL_TONE: Record<string, string> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  very_hard: 'vhard',
  extra_hard: 'xhard',
  unknown: 'unknown',
};

export function AmbiguityMeter({ level, familyCount, label }: AmbiguityMeterProps) {
  const tone = LEVEL_TONE[level] ?? LEVEL_TONE.unknown;
  const text = label ?? LEVEL_LABEL[level] ?? LEVEL_LABEL.unknown;
  const markerPct = deriveAmbiguityMarkerPct(level);
  const markerStyle: CSSProperties = { '--sf-ambiguity-marker-pct': `${markerPct}%` } as CSSProperties;

  return (
    <div className="sf-ambiguity-meter" data-tone={tone}>
      <div className="sf-ambiguity-head">
        <span className="sf-ambiguity-title">Family ambiguity</span>
        <span className="sf-ambiguity-chip" title={`Family count: ${familyCount}`}>
          <span className="sf-ambiguity-chip-dot" aria-hidden="true" />
          {text} · {familyCount}
        </span>
      </div>
      <div className="sf-ambiguity-scale-wrap">
        {markerPct > 0 ? <span className="sf-ambiguity-marker" style={markerStyle} /> : null}
        <div className="sf-ambiguity-scale" aria-hidden="true">
          <span className="sf-ambiguity-band">easy · 1</span>
          <span className="sf-ambiguity-band">medium · 2–3</span>
          <span className="sf-ambiguity-band">hard · 4–5</span>
          <span className="sf-ambiguity-band">v-hard · 6–8</span>
          <span className="sf-ambiguity-band">x-hard · 9+</span>
        </div>
      </div>
    </div>
  );
}
