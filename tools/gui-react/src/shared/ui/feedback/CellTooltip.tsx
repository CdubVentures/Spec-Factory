import * as Tooltip from '@radix-ui/react-tooltip';
import { pct } from '../../../utils/formatting.ts';
import { pullFormatDateTime } from '../../../utils/dateTime.ts';
import { trafficColor, sourceBadgeDarkClass, SOURCE_BADGE_DARK_FALLBACK } from '../../../utils/colors.ts';

/**
 * Generic state interface that both FieldState (review grid) and
 * ComponentPropertyState (component review) satisfy structurally.
 */
export interface CellTooltipState {
  selected: {
    confidence: number;
    color: 'green' | 'yellow' | 'red' | 'gray' | 'purple';
  };
  needs_review?: boolean;
  reason_codes?: string[];
  source?: string;
  source_timestamp?: string | null;
  method?: string;
  tier?: number | null;
  evidence_url?: string;
  evidence_quote?: string;
  overridden?: boolean;
  candidate_count?: number;
  variance_policy?: string | null;
  candidates?: Array<{
    source?: string;
    method?: string | null;
    tier?: number | null;
    score?: number;
    evidence?: {
      url?: string;
      quote?: string;
    };
  }>;
}

interface CellTooltipProps {
  state: CellTooltipState;
  children: React.ReactNode;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const sourceBadgeStyle = sourceBadgeDarkClass;

const tierBadgeStyle: Record<number, string> = {
  1: 'sf-cell-tooltip-tier-badge sf-cell-tooltip-tier-1',
  2: 'sf-cell-tooltip-tier-badge sf-cell-tooltip-tier-2',
  3: 'sf-cell-tooltip-tier-badge sf-cell-tooltip-tier-3',
};

function humanizeMethod(method: string): string {
  return method
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CellTooltip({ state, children }: CellTooltipProps) {
  const conf = state.selected.confidence;
  const color = state.selected.color;
  const topCandidate = state.candidates?.[0];

  // Resolve source info - prefer direct fields, fall back to top candidate.
  const directSource = state.source;
  const evidenceUrl = state.evidence_url || topCandidate?.evidence?.url || '';
  const hostSource = evidenceUrl ? extractHost(evidenceUrl) : '';
  const quote = state.evidence_quote || topCandidate?.evidence?.quote || '';
  const method = state.method || topCandidate?.method || '';
  const tier = state.tier ?? topCandidate?.tier ?? null;
  const candidateCount = state.candidate_count ?? state.candidates?.length ?? 0;

  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="sf-cell-tooltip-content z-50 max-w-[340px] min-w-[180px] px-3 py-2.5 text-[11px] leading-relaxed rounded-lg shadow-xl border"
          sideOffset={6}
          side="top"
        >
          {/* Row 1: Confidence + status badges */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${trafficColor(color)}`} />
            <span className="sf-cell-tooltip-confidence font-bold text-[12px]">{pct(conf)}</span>
            {tier != null && tier > 0 && (
              <span className={`px-1.5 py-0 rounded text-[9px] font-semibold ${tierBadgeStyle[tier] || 'sf-cell-tooltip-tier-badge sf-cell-tooltip-tier-fallback'}`}>
                T{tier}
              </span>
            )}
            {/* Show source badge but skip "override" when overridden is true to avoid duplicate. */}
            {directSource && !(directSource === 'override' && state.overridden) && (
              <span className={`px-1.5 py-0 rounded text-[9px] font-medium ${sourceBadgeStyle[directSource] || SOURCE_BADGE_DARK_FALLBACK}`}>
                {directSource}
              </span>
            )}
            {Boolean(state.overridden) && (
              <span className="sf-cell-tooltip-overridden-badge px-1.5 py-0 rounded text-[9px] font-semibold">
                overridden
              </span>
            )}
            {state.needs_review && (
              <span className="sf-cell-tooltip-review-badge px-1.5 py-0 rounded text-[9px] font-medium">
                review
              </span>
            )}
          </div>

          {/* Row 2: Source host + method */}
          {(hostSource || method) && (
            <div className="sf-cell-tooltip-meta-row flex items-center gap-2 mb-1">
              {hostSource && (
                <span className="sf-cell-tooltip-meta-host font-medium">{hostSource}</span>
              )}
              {hostSource && method && (
                <span className="sf-cell-tooltip-meta-via">via</span>
              )}
              {method && (
                <span className="sf-cell-tooltip-meta-method">{humanizeMethod(method)}</span>
              )}
            </div>
          )}

          {/* Row 2b: Source name when no host (e.g. "reference" or custom source) */}
          {!hostSource && directSource && !['reference', 'override', 'manual', 'unknown'].includes(directSource) && (
            <div className="sf-cell-tooltip-source-line mb-1">
              Source: <span className="sf-cell-tooltip-source-value">{directSource}</span>
            </div>
          )}

          {/* Row 2c: Source timestamp */}
          {state.source_timestamp && (
            <div className="sf-cell-tooltip-time text-[9px] mb-1">
              set {pullFormatDateTime(state.source_timestamp)}
            </div>
          )}

          {/* Row 3: Evidence URL */}
          {evidenceUrl && (
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="sf-cell-tooltip-link underline truncate block mb-1 text-[10px]"
              onClick={(e) => e.stopPropagation()}
            >
              {evidenceUrl.length > 70 ? evidenceUrl.slice(0, 70) + '...' : evidenceUrl}
            </a>
          )}

          {/* Row 4: Evidence quote */}
          {quote && (
            <div className="sf-cell-tooltip-quote line-clamp-3 italic text-[10px] mb-1 border-l-2 pl-2">
              &ldquo;{quote.slice(0, 180)}{quote.length > 180 ? '...' : ''}&rdquo;
            </div>
          )}

          {/* Row 5: Meta row - candidate count, variance policy */}
          {(candidateCount > 0 || state.variance_policy) && (
            <div className="sf-cell-tooltip-footer flex items-center gap-2 text-[10px] mt-1">
              {candidateCount > 0 && (
                <span>{candidateCount} candidate{candidateCount !== 1 ? 's' : ''}</span>
              )}
              {state.variance_policy && (
                <span className="sf-cell-tooltip-variance-pill px-1 py-0 rounded text-[9px]">
                  {state.variance_policy}
                </span>
              )}
            </div>
          )}

          {/* Row 6: Reason codes */}
          {(state.reason_codes ?? []).length > 0 && (
            <div className="sf-cell-tooltip-reason-list mt-1.5 flex flex-wrap gap-1">
              {(state.reason_codes ?? []).slice(0, 4).map((rc) => (
                <span key={rc} className="sf-cell-tooltip-reason-chip px-1.5 py-0.5 text-[9px] rounded">
                  {rc.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          <Tooltip.Arrow className="sf-cell-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
