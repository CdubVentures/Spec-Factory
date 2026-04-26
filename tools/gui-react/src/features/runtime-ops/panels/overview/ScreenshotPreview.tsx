import { useState } from 'react';
import type { WorkerScreenshot } from '../../types.ts';
import { formatBytes } from '../../helpers.ts';
import { runtimeAssetUrl } from '../../assetUrls.ts';

interface ScreenshotPreviewProps {
  screenshot: WorkerScreenshot;
  runId: string;
}

export function ScreenshotPreview({ screenshot, runId }: ScreenshotPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const thumbSrc = runtimeAssetUrl(runId, screenshot.filename, { variant: 'thumb' });
  const previewSrc = runtimeAssetUrl(runId, screenshot.filename, { variant: 'preview' });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="sf-surface-elevated sf-row-hoverable overflow-hidden transition-colors group"
      >
        <div className="relative sf-surface-shell aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full sf-meter-track flex items-center justify-center animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full sf-meter-fill" />
              </div>
            </div>
          )}
          <img
            src={thumbSrc}
            alt={screenshot.filename}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
          />
        </div>
        <div className="px-2 py-1 sf-text-caption sf-text-muted text-left">
          {screenshot.width}x{screenshot.height} &middot; {formatBytes(screenshot.bytes)}
        </div>
      </button>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 sf-overlay-backdrop-bg flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setIsExpanded(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewSrc}
              alt={screenshot.filename}
              className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
              decoding="async"
            />
            <div className="absolute bottom-0 left-0 right-0 sf-overlay-button-strong-bg sf-overlay-text-strong text-xs px-3 py-2 rounded flex items-center justify-between">
              <span className="font-mono">{screenshot.filename}</span>
              <span>{screenshot.width}x{screenshot.height} &middot; {formatBytes(screenshot.bytes)}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 w-8 h-8 sf-overlay-button-strong-bg sf-overlay-text-strong rounded-full flex items-center justify-center hover:sf-overlay-backdrop-bg text-sm"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
}
