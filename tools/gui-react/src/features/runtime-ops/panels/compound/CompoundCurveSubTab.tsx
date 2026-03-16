import { ConfidenceBar } from '../../components/ConfidenceBar';
import { Sparkline } from '../../components/Sparkline';
import { truncateUrl } from '../../helpers';
import type { CompoundCurveResponse, CompoundVerdict } from '../../types';

interface CompoundCurveSubTabProps {
  data: CompoundCurveResponse | undefined;
}

function verdictChipClass(verdict: CompoundVerdict): string {
  switch (verdict) {
    case 'PROVEN':
      return 'sf-chip-success';
    case 'PARTIAL':
      return 'sf-chip-warning';
    case 'NOT_PROVEN':
      return 'sf-chip-danger';
  }
}

export function CompoundCurveSubTab({ data }: CompoundCurveSubTabProps) {
  if (!data || data.runs.length === 0) {
    return <div className="p-6 text-center sf-text-muted">No run data available</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`${verdictChipClass(data.verdict)} px-2 py-0.5 text-xs font-bold rounded`}>
          {data.verdict}
        </span>
        <span className="sf-text-caption sf-text-muted">
          {data.search_reduction_pct.toFixed(1)}% search reduction
        </span>
        <span className="sf-text-caption sf-text-muted">
          URL reuse trend: <span className="font-semibold sf-text-primary">{data.url_reuse_trend}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b sf-border-soft">
              <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Run ID</th>
              <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Searches</th>
              <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">URL Reuse %</th>
              <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">New URLs</th>
              <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Fill Rate %</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((run) => (
              <tr key={run.run_id} className="border-b sf-border-soft">
                <td className="px-2 py-1.5 font-mono sf-text-subtle">{truncateUrl(run.run_id, 16)}</td>
                <td className="px-2 py-1.5 font-mono font-bold sf-text-primary">{run.searches}</td>
                <td className="px-2 py-1.5">
                  <ConfidenceBar value={run.url_reuse_pct / 100} />
                </td>
                <td className="px-2 py-1.5 font-mono sf-text-subtle">{run.new_urls}</td>
                <td className="px-2 py-1.5">
                  <ConfidenceBar value={run.fill_rate_pct / 100} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-6 flex-wrap">
        <div>
          <div className="sf-text-caption sf-text-muted uppercase tracking-wider mb-1">Searches per run</div>
          <Sparkline values={data.runs.map((r) => r.searches)} />
        </div>
        <div>
          <div className="sf-text-caption sf-text-muted uppercase tracking-wider mb-1">URL Reuse %</div>
          <Sparkline values={data.runs.map((r) => r.url_reuse_pct)} />
        </div>
      </div>
    </div>
  );
}
