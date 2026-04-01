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
  formatDateTime,
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
    <div className="min-w-[12rem] rounded border border-gray-200 dark:border-gray-700 px-2 py-1">
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center">
          {label}
          {tooltip ? <Tip text={tooltip} /> : null}
        </span>
        <span className={active ? 'text-emerald-600 dark:text-emerald-300' : ''}>
          {formatNumber(currentPerMin, 1)}/min
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded ${active ? 'bg-emerald-500' : 'bg-gray-400'}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}
