import { truncateUrl } from '../../helpers.ts';
import type { QuerySummaryResponse } from '../../types.ts';

interface QueryIndexSubTabProps {
  data: QuerySummaryResponse | undefined;
}

export function QueryIndexSubTab({ data }: QueryIndexSubTabProps) {
  if (!data) {
    return <div className="p-6 text-center sf-text-muted">No query data available</div>;
  }

  const deadPct = data.total > 0 ? ((data.dead_count / data.total) * 100).toFixed(1) : '0';
  const providers = Object.entries(data.provider_breakdown);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="sf-text-caption sf-text-primary font-semibold">{data.total} queries</span>
        <span className="sf-chip-danger px-2 py-0.5 text-xs font-bold rounded">
          {data.dead_count} dead ({deadPct}%)
        </span>
      </div>

      {providers.length > 0 && (
        <div>
          <h4 className="sf-text-caption sf-text-muted uppercase tracking-wider font-semibold mb-2">Provider Breakdown</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b sf-border-soft">
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Provider</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Queries</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Results</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Avg Yield</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(([provider, breakdown]) => (
                <tr key={provider} className="border-b sf-border-soft">
                  <td className="px-2 py-1.5 font-semibold sf-text-primary">{provider}</td>
                  <td className="px-2 py-1.5 font-mono">{breakdown.query_count}</td>
                  <td className="px-2 py-1.5 font-mono">{breakdown.total_results}</td>
                  <td className="px-2 py-1.5 font-mono">{(breakdown.avg_field_yield * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.top_yield.length > 0 && (
        <div>
          <h4 className="sf-text-caption sf-text-muted uppercase tracking-wider font-semibold mb-2">Top Yield Queries</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b sf-border-soft">
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Query</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Provider</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Avg Yield</th>
              </tr>
            </thead>
            <tbody>
              {data.top_yield.map((entry) => (
                <tr key={`${entry.query}-${entry.provider}`} className="border-b sf-border-soft">
                  <td className="px-2 py-1.5 font-mono sf-text-primary truncate max-w-xs">{truncateUrl(entry.query, 60)}</td>
                  <td className="px-2 py-1.5 font-semibold sf-text-subtle">{entry.provider}</td>
                  <td className="px-2 py-1.5 font-mono">{(entry.avg_yield * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
