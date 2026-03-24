/**
 * Centralized settings unload guard.
 *
 * Module-level singleton (NOT a React hook) that attaches beforeunload +
 * pagehide listeners and calls teardownFetch for any dirty settings
 * domains when the page tears down.
 *
 * WHY: React unmount effects do not reliably fire during hard reload, and
 * even when they do, standard fetch is aborted by the browser. keepalive
 * survives page teardown.
 */

import { teardownFetch } from '../api/teardownFetch.ts';

export interface UnloadGuardRegistration {
  domain: string;
  isDirty: () => boolean;
  getPayload: () => { url: string; method: 'PUT' | 'POST'; body: unknown } | null;
  markFlushed: () => void;
}

const registrations = new Map<string, UnloadGuardRegistration>();
const flushedByUnload = new Set<string>();
const flushedByUnmount = new Set<string>();

let listenersAttached = false;

function onUnload(): void {
  for (const [domain, reg] of registrations) {
    try {
      if (flushedByUnmount.has(domain)) continue;
      if (!reg.isDirty()) continue;
      const payload = reg.getPayload();
      if (!payload) {
        reg.markFlushed();
        flushedByUnload.add(domain);
        continue;
      }
      teardownFetch(payload);
      reg.markFlushed();
      flushedByUnload.add(domain);
    } catch {
      // Guard must never throw during unload.
    }
  }
}

function attachListeners(): void {
  if (listenersAttached) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeunload', onUnload);
  window.addEventListener('pagehide', onUnload);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached) return;
  if (typeof window === 'undefined') return;
  window.removeEventListener('beforeunload', onUnload);
  window.removeEventListener('pagehide', onUnload);
  listenersAttached = false;
}

export function registerUnloadGuard(reg: UnloadGuardRegistration): () => void {
  registrations.set(reg.domain, reg);
  flushedByUnload.delete(reg.domain);
  flushedByUnmount.delete(reg.domain);
  attachListeners();

  return () => {
    registrations.delete(reg.domain);
    if (registrations.size === 0) {
      detachListeners();
    }
  };
}

export function markDomainFlushedByUnmount(domain: string): void {
  flushedByUnmount.add(domain);
}

export function isDomainFlushedByUnload(domain: string): boolean {
  return flushedByUnload.has(domain);
}
