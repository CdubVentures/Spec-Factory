import { memo } from 'react';
import type { CarouselSlide } from '../types.ts';

interface CarouselPreviewCardProps {
  readonly slides: readonly CarouselSlide[];
  readonly onClick: () => void;
}

export const CarouselPreviewCard = memo(function CarouselPreviewCard({ slides, onClick }: CarouselPreviewCardProps) {
  const enabled = slides.length > 0;
  const previews = slides.slice(0, 4);

  return (
    <div
      className={`shrink-0 rounded-lg border overflow-hidden flex flex-col transition-all w-40 ${
        enabled
          ? 'sf-border-soft sf-surface-elevated cursor-pointer hover:shadow-md'
          : 'border-dashed sf-border-soft pointer-events-none opacity-30'
      }`}
      onClick={enabled ? onClick : undefined}
    >
      <div className="relative w-full h-28 overflow-hidden sf-surface-bg">
        {enabled ? (
          <>
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px pif-mosaic-gap-bg">
              {previews.map((s, i) => (
                <div key={i} className="flex items-center justify-center overflow-hidden sf-surface-bg">
                  <img src={s.src} alt={s.slotLabel} className="w-full h-full object-cover" draggable={false} />
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - previews.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="sf-surface-bg" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pif-mosaic-overlay">
              <span className="text-white text-lg">{'\u26F6'}</span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <div className="grid grid-cols-2 gap-1 w-7 h-7">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="rounded-sm pif-empty-grid-cell" />
              ))}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">N/A</span>
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 flex flex-col gap-0.5 border-t sf-border-soft text-[8px]">
        <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">Carousel</span>
        <span className="font-mono sf-text-subtle">
          {enabled ? `${slides.length} slot${slides.length !== 1 ? 's' : ''}` : 'run eval first'}
        </span>
      </div>
    </div>
  );
});
