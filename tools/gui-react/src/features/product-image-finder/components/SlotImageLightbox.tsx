import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ProductImageFinderPanel.css';

interface SlotImageLightboxProps {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
}

// WHY: Carousel slot viewer shows the final form only — no original/processed
// side-by-side (that lives in the non-carousel ImageLightbox).
export function SlotImageLightbox({ src, alt, onClose }: SlotImageLightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pif-lightbox-overlay"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center sf-overlay-text-button text-xl pif-lightbox-close"
      >
        {'\u2715'}
      </button>
      <div
        className="flex items-center justify-center w-full h-full p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
      </div>
    </div>,
    document.body,
  );
}
