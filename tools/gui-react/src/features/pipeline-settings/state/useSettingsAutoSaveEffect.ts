/**
 * Generic auto-save effect hook — O(1) replacement for per-domain copy-paste.
 *
 * WHY: 4 authority hooks duplicated ~130 lines each of identical auto-save
 * boilerplate (refs, debounce, unload guard, unmount flush). This hook owns
 * all of it. Adding a new settings domain requires zero copy-paste.
 */

import { useCallback, useEffect, useRef } from 'react';
import { shouldAutoSave, shouldFlushOnUnmount } from './settingsAutoSaveGate.ts';
import { teardownFetch } from '../../../api/teardownFetch.ts';
import {
  registerUnloadGuard,
  markDomainFlushedByUnmount,
  isDomainFlushedByUnload,
} from '../../../stores/settingsUnloadGuard.ts';

export interface UseSettingsAutoSaveOptions {
  domain: string;
  debounceMs: number;
  payloadFingerprint: string;
  dirty: boolean;
  autoSaveEnabled: boolean;
  initialHydrationApplied: boolean;
  enabled?: boolean;
  saveFn: () => void;
  getUnloadBody: () => unknown;
  unloadUrl: string;
  unloadMethod?: 'PUT' | 'POST';
  /** Called synchronously when unmount flush fires, before teardownFetch.
   * WHY: Signals that edits are in transit (keepalive fetch) but not yet
   * confirmed by the server. The store should block hydrate() until the
   * server confirms via WebSocket event. */
  onFlushPending?: () => void;
}

export interface UseSettingsAutoSaveResult {
  markSaved: (fingerprint: string) => void;
  clearAttemptFingerprint: () => void;
  seedFingerprint: (fingerprint: string) => void;
  prepareFlush: () => boolean;
}

export function useSettingsAutoSaveEffect({
  domain,
  debounceMs,
  payloadFingerprint,
  dirty,
  autoSaveEnabled,
  initialHydrationApplied,
  enabled = true,
  saveFn,
  getUnloadBody,
  unloadUrl,
  unloadMethod = 'PUT',
  onFlushPending,
}: UseSettingsAutoSaveOptions): UseSettingsAutoSaveResult {
  const lastSavedFingerprintRef = useRef('');
  const lastAttemptFingerprintRef = useRef('');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WHY: Sync refs keep values accessible inside setTimeout / unload / unmount
  // callbacks without adding them to effect dependency arrays.
  const dirtyRef = useRef(dirty);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  const enabledRef = useRef(enabled);
  const payloadFingerprintRef = useRef(payloadFingerprint);
  const saveFnRef = useRef(saveFn);
  const getUnloadBodyRef = useRef(getUnloadBody);
  const onFlushPendingRef = useRef(onFlushPending);
  dirtyRef.current = dirty;
  autoSaveEnabledRef.current = autoSaveEnabled;
  enabledRef.current = enabled;
  payloadFingerprintRef.current = payloadFingerprint;
  saveFnRef.current = saveFn;
  getUnloadBodyRef.current = getUnloadBody;
  onFlushPendingRef.current = onFlushPending;

  // --- Auto-save effect ---
  useEffect(() => {
    if (!enabled) return;
    const canSave = shouldAutoSave({
      autoSaveEnabled,
      dirty,
      payloadFingerprint,
      lastSavedFingerprint: lastSavedFingerprintRef.current,
      lastAttemptFingerprint: lastAttemptFingerprintRef.current,
      initialHydrationApplied,
    });
    if (!canSave) return;
    lastAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      pendingTimerRef.current = null;
      saveFnRef.current();
    }, debounceMs);
    pendingTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (pendingTimerRef.current === timer) {
        pendingTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, dirty, payloadFingerprint, initialHydrationApplied, enabled, debounceMs]);

  // --- Unload guard ---
  useEffect(() => {
    return registerUnloadGuard({
      domain,
      isDirty: () => {
        if (!enabledRef.current || !dirtyRef.current || !autoSaveEnabledRef.current) return false;
        const fp = payloadFingerprintRef.current;
        return Boolean(fp) && fp !== lastSavedFingerprintRef.current;
      },
      getPayload: () => ({
        url: unloadUrl,
        method: unloadMethod,
        body: getUnloadBodyRef.current(),
      }),
      markFlushed: () => {
        lastAttemptFingerprintRef.current = payloadFingerprintRef.current;
      },
    });
  }, [domain, unloadUrl, unloadMethod]);

  // --- Unmount flush ---
  useEffect(() => {
    return () => {
      const hadPendingTimer = Boolean(pendingTimerRef.current);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      const flush = shouldFlushOnUnmount({
        alreadyFlushedByUnload: isDomainFlushedByUnload(domain),
        hadPendingTimer,
        enabled: enabledRef.current,
        dirty: dirtyRef.current,
        autoSaveEnabled: autoSaveEnabledRef.current,
        payloadFingerprint: payloadFingerprintRef.current,
        lastSavedFingerprint: lastSavedFingerprintRef.current,
        lastAttemptFingerprint: lastAttemptFingerprintRef.current,
      });
      if (!flush) return;
      lastAttemptFingerprintRef.current = payloadFingerprintRef.current;
      // WHY: Signal that edits are in transit before the fire-and-forget fetch.
      // The store sets flushPending=true so hydrate() blocks until the server
      // confirms the write via WebSocket event (SET-005).
      onFlushPendingRef.current?.();
      teardownFetch({
        url: unloadUrl,
        method: unloadMethod,
        body: getUnloadBodyRef.current(),
      });
      markDomainFlushedByUnmount(domain);
    };
  // WHY: deps=[] — uses refs for all mutable values. Fixes the LLM Settings
  // 9-dep bug where cleanup fired on every render, not just unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Callbacks ---

  const markSaved = useCallback((fingerprint: string) => {
    lastSavedFingerprintRef.current = fingerprint;
    lastAttemptFingerprintRef.current = fingerprint;
  }, []);

  // WHY: Resets attempt to last saved, unblocking retries after a failed save.
  // Without this, a failed save permanently blocks the same payload from being
  // auto-saved again because the gate checks payloadFP === lastAttemptFP.
  const clearAttemptFingerprint = useCallback(() => {
    lastAttemptFingerprintRef.current = lastSavedFingerprintRef.current;
  }, []);

  const seedFingerprint = useCallback((fingerprint: string) => {
    lastSavedFingerprintRef.current = fingerprint;
    lastAttemptFingerprintRef.current = fingerprint;
  }, []);

  // WHY: For flushIfDirty — cancel pending timer, set attempt fp,
  // return whether the caller should proceed with a synchronous save.
  const prepareFlush = useCallback((): boolean => {
    const fp = payloadFingerprintRef.current;
    if (!fp || fp === lastSavedFingerprintRef.current) return false;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    lastAttemptFingerprintRef.current = fp;
    return true;
  }, []);

  return { markSaved, clearAttemptFingerprint, seedFingerprint, prepareFlush };
}
