import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import './Popover.css';

export type PopoverPlacement = 'bottom' | 'top';

export interface PopoverProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly triggerLabel?: string;
  readonly triggerClassName?: string;
  readonly contentClassName?: string;
  /** Preferred vertical placement; flips if no room. Defaults to 'bottom'. */
  readonly placement?: PopoverPlacement;
  /** Controlled open state; omit for uncontrolled. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Stop clicks bubbling to parent row handlers. Defaults true. */
  readonly stopPropagation?: boolean;
}

interface PositionState {
  readonly top: number;
  readonly left: number;
  readonly placement: PopoverPlacement;
  readonly arrowLeft: number;
}

const OFFSET = 8;          // gap between trigger and panel
const VIEWPORT_PAD = 10;    // min gap from viewport edge
const EST_CONTENT_W = 280;  // initial estimate before measurement
const EST_CONTENT_H = 180;

function computePosition(triggerRect: DOMRect, contentRect: { width: number; height: number }, preferred: PopoverPlacement): PositionState {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Flip vertical if not enough room on preferred side.
  const spaceBelow = vh - triggerRect.bottom - OFFSET - VIEWPORT_PAD;
  const spaceAbove = triggerRect.top - OFFSET - VIEWPORT_PAD;
  let placement: PopoverPlacement = preferred;
  if (preferred === 'bottom' && spaceBelow < contentRect.height && spaceAbove > spaceBelow) {
    placement = 'top';
  } else if (preferred === 'top' && spaceAbove < contentRect.height && spaceBelow > spaceAbove) {
    placement = 'bottom';
  }

  const top = placement === 'bottom'
    ? Math.round(triggerRect.bottom + OFFSET)
    : Math.round(triggerRect.top - OFFSET - contentRect.height);

  // Center over the trigger, clamp to viewport.
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const rawLeft = triggerCenterX - contentRect.width / 2;
  const maxLeft = vw - contentRect.width - VIEWPORT_PAD;
  const left = Math.round(Math.max(VIEWPORT_PAD, Math.min(rawLeft, maxLeft)));

  // Arrow stays anchored to the trigger center even if the panel shifted to stay on-screen.
  const arrowLeft = Math.round(Math.max(16, Math.min(contentRect.width - 16, triggerCenterX - left)));

  return { top, left, placement, arrowLeft };
}

/**
 * Lightweight click-to-open popover — portal-mounted (no container overflow /
 * stacking gotchas), span-based trigger (no button baseline shift inside table
 * cells). Measures content on open to flip / clamp; closes on outside click,
 * Esc, and scroll. Keyboard: Space / Enter toggles.
 *
 * Designed to be composed with `FinderRunPopoverShell` for the finder-run
 * pattern (title + model badge + actions).
 */
export function Popover({
  trigger,
  children,
  triggerLabel,
  triggerClassName = '',
  contentClassName = '',
  placement = 'bottom',
  open: openProp,
  onOpenChange,
  stopPropagation = true,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<PositionState | null>(null);

  // Measure + position. First pass uses estimates; second pass after real measurement.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const tRect = triggerRef.current?.getBoundingClientRect();
    if (!tRect) return;
    const cRect = contentRef.current?.getBoundingClientRect();
    const measured = cRect && cRect.width > 0
      ? { width: cRect.width, height: cRect.height }
      : { width: EST_CONTENT_W, height: EST_CONTENT_H };
    setPos(computePosition(tRect, measured, placement));
  }, [open, placement, children]);

  // Close on OUTSIDE scroll / resize rather than reposition — matches typical
  // cell-popover UX. Scrolls originating inside the popover itself (e.g. the
  // key-list overflow) must NOT close it, so we filter by event target.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && contentRef.current && contentRef.current.contains(target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, setOpen]);

  // Outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const onTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setOpen(!open);
  };
  const onTriggerKey = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      setOpen(!open);
    }
  };

  const contentStyle: CSSProperties = pos
    ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 200, visibility: 'visible' }
    : { position: 'fixed', top: -9999, left: -9999, zIndex: 200, visibility: 'hidden' };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`sf-popover-trigger ${triggerClassName}`}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKey}
      >
        {trigger}
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={contentRef}
          role="dialog"
          style={contentStyle}
          className={`sf-popover-panel sf-popover-${pos?.placement ?? placement} ${contentClassName}`}
          onClick={(e) => { if (stopPropagation) e.stopPropagation(); }}
          onMouseDown={(e) => { if (stopPropagation) e.stopPropagation(); }}
        >
          <span
            className="sf-popover-arrow"
            style={pos ? { left: pos.arrowLeft } : undefined}
            aria-hidden
          />
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
