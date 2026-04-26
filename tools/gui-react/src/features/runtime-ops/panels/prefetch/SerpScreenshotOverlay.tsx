import { useState, useCallback, useRef, useEffect } from 'react';

interface SerpScreenshotOverlayProps {
  src: string;
  filename: string;
  onClose: () => void;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 540;

export function SerpScreenshotOverlay({ src, filename, onClose }: SerpScreenshotOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 80, y: 60 });
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    e.preventDefault();
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos.x, pos.y]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
  }, [size.w, size.h]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const onMove = (e: MouseEvent) => {
      if (dragging) {
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      }
      if (resizing) {
        const dw = e.clientX - resizeStart.current.x;
        const dh = e.clientY - resizeStart.current.y;
        setSize({
          w: Math.max(MIN_WIDTH, resizeStart.current.w + dw),
          h: Math.max(MIN_HEIGHT, resizeStart.current.h + dh),
        });
      }
    };

    const onUp = () => {
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing]);

  return (
    <div
      ref={overlayRef}
      className="fixed z-50 flex flex-col rounded-lg overflow-hidden shadow-2xl border sf-border-default sf-surface-shell"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        userSelect: dragging || resizing ? 'none' : 'auto',
      }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 sf-surface-elevated border-b sf-border-soft cursor-move shrink-0"
        onMouseDown={onDragStart}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 sf-text-info shrink-0">
          <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13 3a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-mono sf-text-primary truncate flex-1">{filename}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-0.5 rounded hover:sf-surface-shell cursor-pointer sf-text-muted hover:sf-text-primary"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Image — scrollable */}
      <div className="flex-1 overflow-auto sf-overlay-surface-deep-bg min-h-0">
        <img
          src={src}
          alt="Google SERP Screenshot"
          className="w-full h-auto"
          draggable={false}
        />
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        data-resize-handle
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={onResizeStart}
      >
        <svg viewBox="0 0 16 16" className="w-full h-full sf-text-muted">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" opacity="0.4" />
          <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}
