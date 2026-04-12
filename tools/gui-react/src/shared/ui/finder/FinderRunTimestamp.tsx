/**
 * FinderRunTimestamp — shared time + duration display for run history rows.
 *
 * Shows the run start time in PST and the total duration.
 * Placed between date and model badge in both CEF and PIF run history rows.
 */

/** Format an ISO timestamp to PST time string (e.g. "3:42 PM"). */
function formatTimePST(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** Format duration in ms to a human-readable string (e.g. "1m 23s", "45s"). */
function formatDuration(ms: number): string {
  if (ms == null || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export function FinderRunTimestamp({
  startedAt,
  durationMs,
}: {
  readonly startedAt?: string | null;
  readonly durationMs?: number | null;
}) {
  const time = startedAt ? formatTimePST(startedAt) : '';
  const dur = durationMs != null ? formatDuration(durationMs) : '';

  if (!time && !dur) return null;

  return (
    <span className="font-mono text-[10px] sf-text-muted whitespace-nowrap">
      {time}{time && dur ? ' · ' : ''}{dur}
    </span>
  );
}
