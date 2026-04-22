import type { RefObject } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

export interface SlashFocusContext {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

export function shouldFireSlash(ctx: SlashFocusContext): boolean {
  const tag = (ctx.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (ctx.isContentEditable) return false;
  return true;
}

export function useSlashFocus(targetRef: RefObject<HTMLInputElement>) {
  useHotkeys(
    '/',
    (event) => {
      const target = event.target;
      const ctx: SlashFocusContext = target instanceof HTMLElement
        ? { tagName: target.tagName, isContentEditable: target.isContentEditable }
        : {};
      if (!shouldFireSlash(ctx)) return;
      event.preventDefault();
      const node = targetRef.current;
      if (!node) return;
      node.focus();
      if (typeof node.select === 'function') node.select();
    },
    { enableOnFormTags: false, preventDefault: false },
  );
}
