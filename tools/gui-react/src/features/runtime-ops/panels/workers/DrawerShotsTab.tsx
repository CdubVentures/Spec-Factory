import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import type { WorkerScreenshot, RuntimeOpsWorkerLastFrameResponse } from '../../types.ts';
import { formatBytes } from '../../helpers.ts';
import { relativeTime } from '../../../../utils/formatting.ts';

interface DrawerShotsTabProps {
  screenshots: WorkerScreenshot[];
  runId: string;
  workerId: string;
  isRunning: boolean;
}

export function DrawerShotsTab({ screenshots, runId, workerId, isRunning }: DrawerShotsTabProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data: retainedFrameResponse } = useQuery({
    queryKey: ['runtime-ops', runId, 'worker-last-frame', workerId],
    queryFn: () => api.get<RuntimeOpsWorkerLastFrameResponse>(
      `/indexlab/run/${encodeURIComponent(runId)}/runtime/screencast/${encodeURIComponent(workerId)}/last`,
    ),
    enabled: Boolean(runId && workerId),
    refetchInterval: isRunning ? 3000 : false,
    retry: false,
  });
  const retainedFrame = retainedFrameResponse?.frame ?? null;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;
    if (e.key === 'Escape') setLightboxIndex(null);
    if (e.key === 'ArrowLeft') setLightboxIndex((i) => i !== null && i > 0 ? i - 1 : i);
    if (e.key === 'ArrowRight') setLightboxIndex((i) => i !== null && i < screenshots.length - 1 ? i + 1 : i);
  }, [lightboxIndex, screenshots.length]);

  useEffect(() => {
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightboxIndex, handleKeyDown]);

  if (screenshots.length === 0 && !retainedFrame) {
    return (
      <div className="py-4 text-center">
        <div className="text-xs sf-text-subtle">No screenshots or retained runtime frame</div>
        <div className="mt-1 text-xs sf-text-muted">
          This fetch ended without a visual asset event or a cached end-of-stream browser image.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Retained frame */}
      {retainedFrame && (
        <div className="sf-surface-elevated overflow-hidden">
          <div className="border-b sf-border-soft px-2 py-2 text-xs">
            <div className="font-medium sf-text-primary">Retained runtime frame</div>
            <div className="mt-1 flex items-center gap-2 sf-text-subtle">
              <span className="sf-chip-neutral px-1 py-0.5 rounded">{retainedFrame.width}&times;{retainedFrame.height}</span>
              <span className="font-mono">{relativeTime(retainedFrame.ts)}</span>
            </div>
          </div>
          <div className="p-2 sf-surface-panel">
            <img
              src={`data:${retainedFrame.mime_type || 'image/jpeg'};base64,${retainedFrame.data}`}
              alt="Retained runtime frame"
              className="w-full rounded"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* 2-column thumbnail grid */}
      {screenshots.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {screenshots.map((s, idx) => (
            <button
              key={s.filename}
              type="button"
              className="sf-surface-elevated overflow-hidden rounded text-left group"
              onClick={() => setLightboxIndex(idx)}
            >
              <div className="relative">
                <img
                  src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(s.filename)}`}
                  alt={s.filename}
                  className="w-full rounded-t"
                  loading="lazy"
                />
                <div className="absolute top-1 right-1 sf-chip-neutral px-1 py-0.5 rounded sf-text-nano opacity-80">
                  {s.width}&times;{s.height} &middot; {formatBytes(s.bytes)}
                </div>
              </div>
              <div className="px-1.5 py-1 space-y-0.5">
                <div className="sf-text-nano sf-text-primary font-mono truncate">{s.filename}</div>
                <div className="sf-text-nano sf-text-muted font-mono truncate">{relativeTime(s.ts)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxIndex !== null && screenshots[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close lightbox"
          />
          <div className="relative z-10 max-w-[90vw] max-h-[90vh]">
            <img
              src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(screenshots[lightboxIndex].filename)}`}
              alt={screenshots[lightboxIndex].filename}
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
            <div className="absolute bottom-2 left-2 sf-chip-neutral px-2 py-1 rounded text-xs">
              {screenshots[lightboxIndex].width}&times;{screenshots[lightboxIndex].height} &middot; {formatBytes(screenshots[lightboxIndex].bytes)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
