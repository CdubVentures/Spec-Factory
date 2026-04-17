/**
 * FinderRunTimestamp — shared time + duration display for run history rows.
 *
 * Time renders in the user-selected timezone from settings (default PST).
 * Duration is timezone-agnostic.
 */

import { pullFormatTime } from '../../../utils/dateTime.ts';

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
  const time = startedAt ? pullFormatTime(startedAt) : '';
  const dur = durationMs != null ? formatDuration(durationMs) : '';

  if (!time && !dur) return null;

  return (
    <span className="font-mono text-[10px] sf-text-muted whitespace-nowrap">
      {time}{time && dur ? ' · ' : ''}{dur}
    </span>
  );
}
