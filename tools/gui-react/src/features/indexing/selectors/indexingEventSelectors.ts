import type { IndexLabEvent } from '../state/indexlabStore.ts';
import type { TimedIndexLabEvent } from '../types.ts';

interface DeriveIndexLabLiveEventsInput {
  liveIndexLabByRun: Record<string, IndexLabEvent[]>;
  selectedIndexLabRunId: string;
  runViewCleared: boolean;
}

interface IndexLabEventsResponseLike {
  events?: IndexLabEvent[];
}

export function deriveIndexLabLiveEvents({
  liveIndexLabByRun,
  selectedIndexLabRunId,
  runViewCleared,
}: DeriveIndexLabLiveEventsInput): IndexLabEvent[] {
  if (!selectedIndexLabRunId) return [];
  if (runViewCleared) return [];
  return liveIndexLabByRun[selectedIndexLabRunId] || [];
}

export function deriveIndexLabEvents(
  indexlabEventsResp: IndexLabEventsResponseLike | undefined,
  indexlabLiveEvents: IndexLabEvent[]
): IndexLabEvent[] {
  const merged = [
    ...(indexlabEventsResp?.events || []),
    ...indexlabLiveEvents,
  ];
  const seen = new Set<string>();
  const rows: IndexLabEvent[] = [];
  for (const row of merged) {
    const payload = row?.payload && typeof row.payload === 'object'
      ? JSON.stringify(row.payload)
      : '';
    const key = `${row.run_id}|${row.ts}|${row.stage}|${row.event}|${payload}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  rows.sort((a, b) => Date.parse(String(a.ts || '')) - Date.parse(String(b.ts || '')));
  return rows;
}

export function deriveTimedIndexLabEvents(indexlabEvents: IndexLabEvent[]): TimedIndexLabEvent[] {
  return indexlabEvents
    .map((row) => {
      const tsMs = Date.parse(String(row.ts || ''));
      if (!Number.isFinite(tsMs)) return null;
      const payload = row?.payload && typeof row.payload === 'object'
        ? row.payload as Record<string, unknown>
        : {};
      const topLevel = row as unknown as Record<string, unknown>;
      const payloadProductId = String(payload.product_id || payload.productId || '').trim();
      const productId = String(row.product_id || topLevel.productId || payloadProductId || '').trim();
      return {
        row,
        tsMs,
        stage: String(row.stage || '').trim().toLowerCase(),
        event: String(row.event || '').trim().toLowerCase(),
        productId,
      } as TimedIndexLabEvent;
    })
    .filter((row): row is TimedIndexLabEvent => Boolean(row));
}
