/**
 * CarouselPreviewPopup — full-screen overlay with Embla-powered
 * product image carousel. Professional retail-style viewer with
 * vertical thumbnail rail, grab-to-drag, and keyboard navigation.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { ActionTooltip } from '../../../shared/ui/feedback/ActionTooltip.tsx';
import type { CarouselSlide } from '../types.ts';
import { formatBytes, formatDims } from '../helpers/pifFormatUtils.ts';

/* ── Main popup ───────────────────────────────────────────────────── */

export function CarouselPreviewPopup({
  slides,
  onClose,
}: {
  readonly slides: readonly CarouselSlide[];
  readonly onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [mainRef, mainApi] = useEmblaCarousel({ loop: true });

  // Sync: main scroll → update selected index
  useEffect(() => {
    if (!mainApi) return;
    const onSelect = () => setSelectedIndex(mainApi.selectedScrollSnap());
    mainApi.on('select', onSelect);
    onSelect();
    return () => { mainApi.off('select', onSelect); };
  }, [mainApi]);

  // Keyboard: arrows + escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); mainApi?.scrollPrev(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); mainApi?.scrollNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, mainApi]);

  const onThumbClick = useCallback(
    (index: number) => { mainApi?.scrollTo(index); },
    [mainApi],
  );

  const current = slides[selectedIndex];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white text-xl transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        {'\u2715'}
      </button>

      {/* Content shell — retail-style: vertical thumb rail + main image */}
      <div
        className="relative flex rounded-xl overflow-hidden shadow-2xl"
        style={{ width: '70vw', height: '70vh', backgroundColor: 'rgba(18,18,18,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: Vertical thumbnail rail ── */}
        {slides.length > 1 && (
          <div
            className="shrink-0 flex flex-col gap-1.5 py-3 px-2.5 overflow-y-auto"
            style={{ width: 82, backgroundColor: 'rgba(12,12,12,1)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
          >
            {slides.map((slide, i) => {
              const isActive = i === selectedIndex;
              return (
                <button
                  key={`thumb-${slide.slotLabel}-${i}`}
                  onClick={() => onThumbClick(i)}
                  className={`shrink-0 rounded overflow-hidden transition-all ${
                    isActive ? 'ring-2 ring-offset-1' : 'opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    width: 62,
                    height: 62,
                    ...(isActive
                      ? { ringColor: 'var(--sf-state-info-fg, #38bdf8)', ringOffsetColor: 'rgba(12,12,12,1)' }
                      : {}),
                  }}
                >
                  <img
                    src={slide.src}
                    alt={slide.slotLabel}
                    className="w-full h-full object-contain"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* ── Right: Main area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Main image viewport */}
          <div className="relative flex-1 min-h-0">
            <div ref={mainRef} className="h-full overflow-hidden cursor-grab active:cursor-grabbing">
              <div className="flex h-full">
                {slides.map((slide, i) => (
                  <div
                    key={`${slide.slotLabel}-${i}`}
                    className="flex-[0_0_100%] min-w-0 flex items-center justify-center"
                    style={{ padding: 'clamp(1rem, 3vw, 3rem)' }}
                  >
                    <img
                      src={slide.src}
                      alt={slide.slotLabel}
                      className="max-w-full max-h-full object-contain select-none rounded"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Prev / Next arrows — large, translucent */}
            {slides.length > 1 && (
              <>
                <button
                  onClick={() => mainApi?.scrollPrev()}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-110"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button
                  onClick={() => mainApi?.scrollNext()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-110"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </>
            )}
          </div>

          {/* ── Bottom info bar ── */}
          <div
            className="shrink-0 flex items-center gap-2.5 px-5 py-2.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(12,12,12,1)' }}
          >
            {current && (
              <>
                <span className="text-[12px] font-bold uppercase tracking-wider text-white/85">
                  {current.slotLabel}
                </span>
                <ActionTooltip text={current.source === 'eval' ? 'LLM selected' : 'User override'}>
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 7, height: 7,
                      backgroundColor: current.source === 'eval' ? '#16a34a' : '#38bdf8',
                    }}
                  />
                </ActionTooltip>
                <div className="flex-1" />
                {current.width > 0 && (
                  <span className="text-[11px] text-white/40 font-mono">
                    {formatDims(current.width, current.height)}
                  </span>
                )}
                {current.bytes > 0 && (
                  <span className="text-[11px] text-white/55 font-mono">
                    {formatBytes(current.bytes)}
                  </span>
                )}
                <span className="text-[11px] text-white/30 font-mono">
                  {selectedIndex + 1} / {slides.length}
                </span>
                {current.reasoning && (
                  <ActionTooltip text={current.reasoning} side="left">
                    <span
                      className="flex items-center justify-center rounded-full font-mono shrink-0 cursor-help"
                      style={{ width: 16, height: 16, fontSize: 9, color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.08)' }}
                    >
                      R
                    </span>
                  </ActionTooltip>
                )}
                {current.runNumber != null && (
                  <ActionTooltip text={`Run ${current.runNumber}`}>
                    <span
                      className="flex items-center justify-center rounded-full font-mono shrink-0"
                      style={{ width: 16, height: 16, fontSize: 9, color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.08)' }}
                    >
                      {current.runNumber}
                    </span>
                  </ActionTooltip>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
