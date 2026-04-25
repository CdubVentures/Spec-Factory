// WHY: Re-exports all pure helpers from indexingHelpers.ts for backward compatibility.
// Only ActivityGauge (JSX) lives here — everything else is in the .ts module.
export {
  normalizeToken,
  getRefetchInterval,
  truthyFlag,
  cleanVariant,
  displayVariant,
  ambiguityLevelFromFamilyCount,
  formatNumber,
  formatBytes,
  providerFromModelToken,
  stripThinkTags,
  extractJsonCandidate,
  extractBalancedJsonSegments,
  tryJsonParseCandidate,
  parseJsonLikeText,
  prettyJsonText,
  isJsonText,
  hostFromUrl,
  looksLikeGraphqlUrl,
  looksLikeJsonUrl,
  looksLikePdfUrl,
  formatDuration,
  percentileMs,
  formatLatencyMs,
  queryFamilyBadge,
  computeActivityStats,
} from './indexingHelpers.ts';

import { Tip } from '../../shared/ui/feedback/Tip.tsx';
import { formatNumber } from './indexingHelpers.ts';

export function ActivityGauge({
  label,
  currentPerMin,
  peakPerMin,
  active,
  tooltip
}: {
  label: string;
  currentPerMin: number;
  peakPerMin: number;
  active: boolean;
  tooltip?: string;
}) {
  const pct = Math.max(0, Math.min(100, (currentPerMin / Math.max(1, peakPerMin)) * 100));
  const displayPct = active && pct <= 0 ? 2 : pct;
  return (
    <div className="min-w-[12rem] rounded border sf-border-default px-2 py-1">
      <div className="flex items-center justify-between text-[10px] sf-status-text-muted">
        <span className="inline-flex items-center">
          {label}
          {tooltip ? <Tip text={tooltip} /> : null}
        </span>
        <span className={active ? 'sf-status-text-success' : ''}>
          {formatNumber(currentPerMin, 1)}/min
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded sf-meter-track overflow-hidden">
        <div
          className={`h-full rounded ${active ? 'sf-meter-fill-success' : 'sf-meter-fill-neutral'}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}
