import type { CrawlEngineStats } from '../../types.ts';
import { StackedScoreBar } from '../../components/StackedScoreBar.tsx';

interface CrawlResponseCardProps {
  engine: CrawlEngineStats | undefined;
}

function formatMs(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// WHY: Groups HTTP status codes into semantic buckets for the stacked bar.
function buildStatusSegments(codes: Record<string, number>): Array<{ label: string; value: number; color: string }> {
  let ok = 0, redirect = 0, clientErr = 0, serverErr = 0;
  for (const [code, count] of Object.entries(codes)) {
    const n = Number(code);
    if (n >= 200 && n < 300) ok += count;
    else if (n >= 300 && n < 400) redirect += count;
    else if (n >= 400 && n < 500) clientErr += count;
    else if (n >= 500) serverErr += count;
  }
  return [
    { label: '2xx OK', value: ok, color: 'sf-meter-fill-success' },
    { label: '3xx Redirect', value: redirect, color: 'sf-meter-fill-info' },
    { label: '4xx Client', value: clientErr, color: 'sf-meter-fill-warning' },
    { label: '5xx Server', value: serverErr, color: 'sf-meter-fill-danger' },
  ].filter((s) => s.value > 0);
}

export function CrawlResponseCard({ engine }: CrawlResponseCardProps) {
  if (!engine) return null;
  const hasData = Object.keys(engine.status_codes).length > 0 || engine.avg_ok_ms > 0;
  if (!hasData) return null;

  const segments = buildStatusSegments(engine.status_codes);

  return (
    <div className="sf-surface-card rounded-lg p-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
        Crawl Response
      </h3>

      {segments.length > 0 && (
        <StackedScoreBar segments={segments} showLegend className="mb-3" />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] sf-text-subtle">Avg OK</div>
          <div className="text-sm font-extrabold font-mono sf-text-primary">{formatMs(engine.avg_ok_ms)}</div>
        </div>
        <div>
          <div className="text-[10px] sf-text-subtle">Avg Fail</div>
          <div className="text-sm font-extrabold font-mono sf-status-text-danger">{formatMs(engine.avg_fail_ms)}</div>
        </div>
      </div>

      {engine.retry_histogram.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] sf-text-subtle mb-1">Retries</div>
          <div className="flex gap-1.5 flex-wrap">
            {engine.retry_histogram.map((count, idx) => (
              <span key={idx} className="font-mono text-[10px] sf-text-muted">{idx}r:{count}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
