import { ConfidenceBar } from '../../components/ConfidenceBar.tsx';
import { truncateUrl } from '../../helpers.ts';
import type { UrlSummaryResponse, HostHealthResponse, HostHealthStatus } from '../../types.ts';

interface UrlIndexSubTabProps {
  urlData: UrlSummaryResponse | undefined;
  hostData: HostHealthResponse | undefined;
}

function hostStatusChipClass(status: HostHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'sf-chip-success';
    case 'cooldown':
    case 'degraded':
      return 'sf-chip-warning';
    case 'blocked':
      return 'sf-chip-danger';
  }
}

export function UrlIndexSubTab({ urlData, hostData }: UrlIndexSubTabProps) {
  const tiers = urlData ? Object.entries(urlData.tier_breakdown) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* URL Summary */}
      {urlData ? (
        <>
          <div className="flex items-center gap-3">
            <span className="sf-text-caption sf-text-primary font-semibold">{urlData.total} URLs</span>
          </div>

          {tiers.length > 0 && (
            <div>
              <h4 className="sf-text-caption sf-text-muted uppercase tracking-wider font-semibold mb-2">Tier Breakdown</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b sf-border-soft">
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Tier</th>
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">URLs</th>
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Fields</th>
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Avg Success</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map(([tier, breakdown]) => (
                    <tr key={tier} className="border-b sf-border-soft">
                      <td className="px-2 py-1.5 font-semibold sf-text-primary">{tier}</td>
                      <td className="px-2 py-1.5 font-mono">{breakdown.url_count}</td>
                      <td className="px-2 py-1.5 font-mono">{breakdown.total_fields}</td>
                      <td className="px-2 py-1.5">
                        <ConfidenceBar value={breakdown.avg_success_rate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {urlData.high_yield.length > 0 && (
            <div>
              <h4 className="sf-text-caption sf-text-muted uppercase tracking-wider font-semibold mb-2">High Yield URLs</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b sf-border-soft">
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">URL</th>
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Visits</th>
                    <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {urlData.high_yield.map((entry) => (
                    <tr key={entry.url} className="border-b sf-border-soft">
                      <td className="px-2 py-1.5 font-mono sf-text-primary truncate max-w-xs">{truncateUrl(entry.url, 50)}</td>
                      <td className="px-2 py-1.5 font-mono">{entry.times_visited}</td>
                      <td className="px-2 py-1.5 font-mono">{entry.fields_filled.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="p-6 text-center sf-text-muted">No URL data available</div>
      )}

      {/* Host Health */}
      <div className="border-t sf-border-soft pt-4">
        <h4 className="sf-text-caption sf-text-muted uppercase tracking-wider font-semibold mb-2">Host Health</h4>
        {hostData && hostData.hosts.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b sf-border-soft">
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Host</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Fetches</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Failed</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Block Rate</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Status</th>
                <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Fields/Fetch</th>
              </tr>
            </thead>
            <tbody>
              {hostData.hosts.map((host) => (
                <tr key={host.host} className="border-b sf-border-soft">
                  <td className="px-2 py-1.5 font-mono sf-text-primary">{host.host}</td>
                  <td className="px-2 py-1.5 font-mono">{host.total}</td>
                  <td className="px-2 py-1.5 font-mono">{host.failed}</td>
                  <td className="px-2 py-1.5">
                    <ConfidenceBar value={host.block_rate} />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`${hostStatusChipClass(host.status)} px-2 py-0.5 text-xs font-bold rounded uppercase`}>
                      {host.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono">{host.avg_fields_per_fetch.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-center sf-text-muted">No host health data available</div>
        )}
      </div>
    </div>
  );
}
