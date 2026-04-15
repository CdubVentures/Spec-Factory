import { memo, useState } from 'react';
import { ActionTooltip } from '../../../shared/ui/feedback/ActionTooltip.tsx';
import type { ProductImageEntry, ResolvedSlot, GalleryImage } from '../types.ts';
import { formatBytes, formatDims } from '../helpers/pifFormatUtils.ts';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';

interface SlotCardProps {
  readonly slot: ResolvedSlot;
  readonly img: ProductImageEntry | null;
  readonly source: 'user' | 'eval' | 'empty';
  readonly category: string;
  readonly productId: string;
  readonly onClear: () => void;
  readonly onDrop: (filename: string) => void;
}

export const SlotCard = memo(function SlotCard({ slot, img, source, category, productId, onClear, onDrop }: SlotCardProps) {
  const [isOver, setIsOver] = useState(false);
  // WHY: '__cleared__' is a sentinel meaning "user intentionally emptied this slot" — treat as no image.
  const filename = (slot.filename && slot.filename !== '__cleared__') ? slot.filename : null;
  const src = filename ? imageServeUrl(category, productId, filename) : '';
  const isHero = slot.slot.startsWith('hero_');
  const label = isHero ? slot.slot.replace('_', ' ').toUpperCase() : slot.slot.toUpperCase();
  const dims = img ? formatDims(img.width, img.height) : '';
  // WHY: Runtime data is GalleryImage (has run_number) but typed as ProductImageEntry.
  const runNumber = (img as GalleryImage | null)?.run_number;

  return (
    <div
      className={`shrink-0 rounded-lg border overflow-hidden flex flex-col transition-colors w-40 ${
        isOver ? 'border-blue-400 ring-2 ring-blue-200' :
        filename ? 'sf-border-soft sf-surface-elevated' : 'border-dashed sf-border-soft'
      } ${filename ? '' : 'opacity-50'}`}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const droppedFilename = e.dataTransfer.getData('text/plain');
        if (droppedFilename) onDrop(droppedFilename);
      }}
    >
      <div
        className={`relative w-full h-32 flex items-center justify-center sf-surface-bg ${img?.bg_removed ? 'p-2' : ''}`}
      >
        {filename ? (
          <img
            src={src}
            alt={`${label} slot`}
            className={img?.bg_removed ? 'max-w-full max-h-full object-contain' : 'w-full h-full object-cover'}
            loading="lazy"
          />
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-wider sf-text-muted">{label}</span>
        )}
      </div>

      <div className="px-2 py-1.5 flex flex-col gap-0.5 border-t sf-border-soft text-[8px]">
        <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">{label}</span>
        {img ? (
          <>
            <span className="font-mono sf-text-subtle">{formatBytes(img.bytes)}</span>
            {dims && <span className="font-mono sf-text-subtle">{dims}px</span>}
          </>
        ) : (
          <span className="sf-text-subtle italic">drop image here</span>
        )}
        <div className="flex items-center gap-1.5">
          {filename && (
            <ActionTooltip text={source === 'user' ? 'Clear user override' : 'Remove from carousel'}>
              <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="text-[9px] leading-none sf-status-text-danger"
              >
                clear
              </button>
            </ActionTooltip>
          )}
          <div className="flex-1" />
          {filename && source !== 'empty' && (
            <ActionTooltip text={source === 'eval' ? 'LLM selected' : 'User override'}>
              <span className={`pif-source-dot ${source === 'eval' ? 'pif-source-dot--eval' : 'pif-source-dot--user'}`} />
            </ActionTooltip>
          )}
          {img?.eval_reasoning && (
            <ActionTooltip text={img.eval_reasoning} side="left">
              <span className="pif-meta-badge cursor-help">R</span>
            </ActionTooltip>
          )}
          {runNumber != null && (
            <ActionTooltip text={`Run ${runNumber}`}>
              <span className="pif-meta-badge">{runNumber}</span>
            </ActionTooltip>
          )}
        </div>
      </div>
    </div>
  );
});
