import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { compactNumber } from '../../../utils/formatting.ts';
import { useFormatDateYMD } from '../../../utils/dateTime.ts';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyTokenChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

interface TokenBarTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; value: number; color: string; name: string }>;
  label?: string;
}

// WHY: Stacked bars — prompt (what we sent) + usage (tool-loop overhead) +
// completion (output) + cached (cache-hit subset of input). Four bands make
// the input-side split visible: reasoning/web-search bloat appears as amber
// usage on top of the sent-prompt cyan.
interface TokenDayRow {
  day: string;
  prompt: number;
  usage: number;
  completion: number;
  cached: number;
}

function buildRows(days: BillingDailyResponse['days'] | undefined): TokenDayRow[] {
  if (!days?.length) return [];
  return [...days]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => {
      const sent = Math.max(0, d.sent_tokens || 0);
      const cached = Math.max(0, d.cached_prompt_tokens || 0);
      const billableInput = Math.max(0, (d.prompt_tokens || 0) - cached);
      const prompt = Math.min(sent, billableInput);
      const usage = Math.max(0, billableInput - prompt);
      return {
        day: d.day,
        prompt: sent > 0 ? prompt : billableInput,
        usage: sent > 0 ? usage : 0,
        completion: d.completion_tokens || 0,
        cached,
      };
    });
}

const LEGEND = [
  { key: 'prompt',     label: 'Prompt',     color: 'var(--sf-tok-prompt, #22d3ee)' },
  { key: 'usage',      label: 'Usage',      color: 'var(--sf-tok-usage, #f59e0b)' },
  { key: 'completion', label: 'Output',     color: 'var(--sf-tok-completion, #a78bfa)' },
  { key: 'cached',     label: 'Cached',     color: 'var(--sf-tok-cached, #34d399)' },
] as const;

function DailyTokenTooltip({ active, payload, label }: TokenBarTooltipProps) {
  const formatDay = useFormatDateYMD();
  if (!active || !payload?.length) return null;
  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;
  const total = nonZero.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="sf-chart-tooltip">
      <div className="sf-chart-tooltip-header">{formatDay(String(label))}</div>
      {nonZero.map((p) => {
        const entry = LEGEND.find((e) => e.key === p.dataKey);
        return (
          <div key={p.dataKey} className="sf-chart-tooltip-row">
            <span className="sf-chart-tooltip-label">
              <span className="sf-filter-dot" style={{ background: entry?.color ?? 'var(--sf-token-text-subtle)' }} />
              {entry?.label ?? p.dataKey}
            </span>
            <span className="sf-chart-tooltip-value">
              {compactNumber(p.value)}
              <span className="sf-chart-tooltip-pct">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : ''}</span>
            </span>
          </div>
        );
      })}
      <div className="sf-chart-tooltip-total">
        <span>Total</span>
        <span className="sf-chart-tooltip-value">{compactNumber(total)}</span>
      </div>
    </div>
  );
}

export function DailyTokenChart({ data, isLoading, isStale }: DailyTokenChartProps) {
  const rows = useMemo(() => buildRows(data?.days), [data]);

  const hasData = !isLoading && rows.length > 0;
  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card sf-tok-themed rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default gap-3">
        <div>
          <h3 className="text-sm font-bold">Daily Tokens</h3>
          <div className="text-[11px] sf-text-subtle mt-0.5">Stacked by token class · 30-day window</div>
        </div>
        {hasData && (
          <div className="flex gap-2 flex-wrap">
            {LEGEND.map((e) => (
              <span key={e.key} className="flex items-center gap-1 text-[10px] sf-text-muted">
                <span className="sf-filter-dot" style={{ background: e.color }} />
                {e.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={`p-5 flex-1 min-h-0${staleClass}`}>
        {isLoading && <SkeletonBlock className="sf-skel-chart" />}
        {!isLoading && rows.length === 0 && (
          <p className="sf-text-subtle text-sm text-center py-8">No daily token data</p>
        )}
        {hasData && (
          <div className="sf-fade-in h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => compactNumber(Number(v))} />
                <Tooltip content={<DailyTokenTooltip />} />
                {LEGEND.map((e) => (
                  <Bar key={e.key} dataKey={e.key} stackId="tokens" fill={e.color} minPointSize={1} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
