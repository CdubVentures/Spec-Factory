import { useState } from 'react';
import type { WorkerScreenshot } from '../types';
import { formatBytes } from '../helpers';

interface ScreenshotPreviewProps {
  screenshot: WorkerScreenshot;
  runId: string;
}

export function ScreenshotPreview({ screenshot, runId }: ScreenshotPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const src = `/api/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(screenshot.filename)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 transition-colors group"
      >
        <div className="relative bg-gray-100 dark:bg-gray-800 aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          <img
            src={src}
            alt={screenshot.filename}
            className="w-full h-full object-cover"
            loading="lazy"
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
          />
        </div>
        <div className="px-2 py-1 text-[10px] text-gray-500 dark:text-gray-400 text-left">
          {screenshot.width}x{screenshot.height} &middot; {formatBytes(screenshot.bytes)}
        </div>
      </button>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setIsExpanded(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={screenshot.filename}
              className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-3 py-2 rounded-b flex items-center justify-between">
              <span className="font-mono">{screenshot.filename}</span>
              <span>{screenshot.width}x{screenshot.height} &middot; {formatBytes(screenshot.bytes)}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
