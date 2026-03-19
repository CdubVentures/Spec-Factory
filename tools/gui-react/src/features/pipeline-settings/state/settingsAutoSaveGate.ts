/**
 * Pure decision functions for settings auto-save gating.
 *
 * WHY: Auto-save must NEVER fire before the first server hydration is applied
 * to the editor. Without this gate, a user who edits a field before hydration
 * completes will trigger an auto-save that sends defaults + one edit, wiping
 * all previously saved settings.
 */

export interface AutoSaveGateInput {
  autoSaveEnabled: boolean;
  dirty: boolean;
  payloadFingerprint: string;
  lastSavedFingerprint: string;
  lastAttemptFingerprint: string;
  initialHydrationApplied: boolean;
}

/**
 * Returns true only when all conditions for firing an auto-save are met.
 *
 * Contract:
 * - autoSaveEnabled must be true
 * - dirty must be true
 * - payloadFingerprint must be non-empty
 * - payloadFingerprint must differ from both lastSaved and lastAttempt
 * - initialHydrationApplied must be true (server data loaded into editor)
 */
export function shouldAutoSave(input: AutoSaveGateInput): boolean {
  if (!input.initialHydrationApplied) return false;
  if (!input.autoSaveEnabled) return false;
  if (!input.dirty) return false;
  if (!input.payloadFingerprint) return false;
  if (input.payloadFingerprint === input.lastSavedFingerprint) return false;
  if (input.payloadFingerprint === input.lastAttemptFingerprint) return false;
  return true;
}

export interface HydrationForceInput {
  serverSettings: unknown;
  dirty: boolean;
  initialHydrationApplied: boolean;
}

/**
 * Returns true when server settings should be force-applied to the editor,
 * overriding the dirty flag.
 *
 * Contract:
 * - serverSettings must be truthy (data arrived from server)
 * - If initialHydrationApplied is false, ALWAYS force-apply (first load wins)
 * - If initialHydrationApplied is true, only apply when NOT dirty (normal flow)
 */
export function shouldForceHydration(input: HydrationForceInput): boolean {
  if (!input.serverSettings) return false;
  if (!input.initialHydrationApplied) return true;
  return !input.dirty;
}
