/**
 * Pure predicate: is the trigger rect still within the visible viewport?
 *
 * Used by Popover to decide whether to reposition (trigger still visible) or
 * close (trigger scrolled off-screen) in response to scroll / resize events.
 * A zero-size rect counts as not-visible so detached/unmounted triggers close.
 */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface RectLike {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

export function isTriggerInViewport(rect: RectLike, viewport: ViewportSize): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom <= 0) return false;
  if (rect.top >= viewport.height) return false;
  if (rect.right <= 0) return false;
  if (rect.left >= viewport.width) return false;
  return true;
}
