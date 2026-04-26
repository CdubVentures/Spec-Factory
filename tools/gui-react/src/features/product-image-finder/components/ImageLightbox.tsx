import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import type { GalleryImage } from '../types.ts';
import { formatBytes, formatDims } from '../helpers/pifFormatUtils.ts';
import { originalImageServeUrl } from '../helpers/pifImageUrls.ts';
import './ProductImageFinderPanel.css';

interface ImageLightboxProps {
  readonly img: GalleryImage;
  readonly src: string;
  readonly category: string;
  readonly productId: string;
  readonly onClose: () => void;
}

export function ImageLightbox({ img, src, category, productId, onClose }: ImageLightboxProps) {
  const dims = formatDims(img.width, img.height);
  const hasOriginal = Boolean(img.original_filename);

  const originalSrc = hasOriginal
    ? originalImageServeUrl(category, productId, img.original_filename ?? '')
    : '';

  const showChecker = img.bg_removed && img.view !== 'hero';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pif-lightbox-overlay"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center sf-overlay-text-button text-xl pif-lightbox-close"
      >
        {'\u2715'}
      </button>

      {hasOriginal && img.bg_removed ? (
        <div
          className="flex-1 flex items-center justify-center w-full p-6 gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-1 flex flex-col items-center gap-2 max-h-full">
            <span className="text-[11px] font-semibold sf-overlay-text-muted uppercase tracking-wider">
              {img.view === 'hero' ? 'Cropped 16:9' : 'Processed'}
            </span>
            <div
              className={`flex items-center justify-center flex-1 rounded-lg overflow-hidden ${showChecker ? 'pif-lightbox-checker' : ''}`}
            >
              <img src={src} alt={`${img.view} processed`} className="max-w-full max-h-[75vh] object-contain" />
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2 max-h-full">
            <span className="text-[11px] font-semibold sf-overlay-text-muted uppercase tracking-wider">Original</span>
            <div className="flex items-center justify-center flex-1 rounded-lg overflow-hidden">
              <img src={originalSrc} alt={`${img.view} original`} className="max-w-full max-h-[75vh] object-contain" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center w-full p-8" onClick={(e) => e.stopPropagation()}>
          <img src={src} alt={img.alt_text || `${img.view} view`} className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <div
        className="w-full px-6 py-3 flex items-center gap-4 flex-wrap justify-center pif-lightbox-info"
        onClick={(e) => e.stopPropagation()}
      >
        <Chip label={`Run #${img.run_number}`} className="sf-chip-info" />
        <Chip label={img.view} className="sf-chip-neutral" />
        {hasOriginal && <Chip label={img.bg_removed ? (img.view === 'hero' ? 'Cropped' : 'BG Removed') : 'RAW'} className={img.bg_removed ? 'sf-chip-success' : 'sf-chip-neutral'} />}
        <span className="text-[12px] sf-overlay-text-soft font-mono">{formatBytes(img.bytes)}</span>
        {dims && <span className="text-[12px] sf-overlay-text-muted font-mono">{dims}px</span>}
        <span className="text-[12px] sf-overlay-text-muted">{img.variant_label || img.variant_key}</span>
        {img.url && (
          <a href={img.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-400 hover:underline font-mono">
            {(() => { try { return new URL(img.url).hostname; } catch { return 'source'; } })()}
          </a>
        )}
        {img.source_page && img.source_page !== img.url && (
          <a href={img.source_page} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-300/60 hover:underline font-mono">
            source page
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}
