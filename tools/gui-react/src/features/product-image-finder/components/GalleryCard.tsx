import { memo, useState } from 'react';
import { ActionTooltip } from '../../../shared/ui/feedback/ActionTooltip.tsx';
import type { GalleryImage } from '../types.ts';
import { formatBytes, formatDims } from '../helpers/pifFormatUtils.ts';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';

interface GalleryCardProps {
  readonly img: GalleryImage;
  readonly category: string;
  readonly productId: string;
  readonly onOpen: (img: GalleryImage) => void;
  readonly onDelete: (filename: string) => void;
  readonly onProcess: (filename: string) => void;
  readonly isProcessing: boolean;
  readonly carouselSource?: 'eval' | 'user';
}

export const GalleryCard = memo(function GalleryCard({
  img, category, productId, onOpen, onDelete, onProcess, isProcessing, carouselSource,
}: GalleryCardProps) {
  const [errored, setErrored] = useState(false);
  const src = img.filename ? imageServeUrl(category, productId, img.filename, img.bytes) : '';
  const dims = formatDims(img.width, img.height);

  const passesQuality = img.quality_pass !== false;
  const isRejected = !!(img.eval_flags?.length);
  const isDimmed = !passesQuality || img.eval_flags?.includes('watermark') || img.eval_flags?.includes('wrong_product');

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', img.filename); e.dataTransfer.effectAllowed = 'copy'; }}
      className={`sf-surface-elevated rounded-lg border overflow-hidden flex flex-col cursor-grab active:cursor-grabbing w-40 ${passesQuality ? 'sf-border-soft' : 'sf-border-danger-soft'} ${isDimmed ? 'opacity-40' : ''}`}
    >
      <button
        onClick={() => onOpen(img)}
        className={`relative w-full h-32 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity ${img.bg_removed ? 'p-2' : ''} ${isRejected ? 'sf-state-danger-bg' : 'sf-surface-bg'}`}
      >
        {src && !errored ? (
          <img
            src={src}
            alt={img.alt_text || `${img.view} view`}
            className={img.bg_removed ? 'max-w-full max-h-full object-contain' : 'w-full h-full object-cover'}
            onError={() => setErrored(true)}
            loading="lazy"
          />
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider sf-text-muted">
            {img.view}
          </span>
        )}
      </button>

      <div className="px-2 py-1.5 flex flex-col gap-0.5 border-t sf-border-soft text-[8px]">
        <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">{img.view}</span>
        <span className="font-mono sf-text-subtle">{formatBytes(img.bytes)}</span>
        {dims && <span className="font-mono sf-text-subtle">{dims}px</span>}
        {img.url && (
          <a href={img.url} target="_blank" rel="noopener noreferrer" className="font-mono sf-text-link truncate hover:underline" title={img.url}>
            {(() => { try { return new URL(img.url).hostname; } catch { return 'source'; } })()}
          </a>
        )}
        <div className="flex items-center gap-1.5">
          {img.filename && !img.bg_removed && (
            <ActionTooltip text={img.view === 'hero' ? 'Center-crop to 16:9' : 'Remove background with RMBG 2.0'}>
              <button
                onClick={(e) => { e.stopPropagation(); onProcess(img.filename); }}
                disabled={isProcessing}
                className="text-[9px] leading-none sf-text-accent"
              >
                {isProcessing ? 'processing...' : img.view === 'hero' ? 'crop' : 'process'}
              </button>
            </ActionTooltip>
          )}
          {img.filename && (
            <ActionTooltip text={`Delete ${img.filename}`}>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(img.filename); }}
                className="text-[9px] leading-none sf-status-text-danger"
              >
                delete
              </button>
            </ActionTooltip>
          )}
          <div className="flex-1" />
          {carouselSource && (
            <ActionTooltip text={carouselSource === 'eval' ? 'LLM selected' : 'User override'}>
              <span className={`pif-source-dot ${carouselSource === 'eval' ? 'pif-source-dot--eval' : 'pif-source-dot--user'}`} />
            </ActionTooltip>
          )}
          {img.eval_reasoning && (
            <ActionTooltip text={img.eval_reasoning} side="left">
              <span className="pif-meta-badge cursor-help">R</span>
            </ActionTooltip>
          )}
          <ActionTooltip text={`Run ${img.run_number}`}>
            <span className="pif-meta-badge">{img.run_number}</span>
          </ActionTooltip>
        </div>
      </div>
    </div>
  );
});
