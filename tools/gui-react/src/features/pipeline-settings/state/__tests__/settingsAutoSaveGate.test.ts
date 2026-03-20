import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  shouldAutoSave,
  shouldFlushOnUnmount,
  shouldForceHydration,
  type AutoSaveGateInput,
  type HydrationForceInput,
  type UnmountFlushGateInput,
} from '../settingsAutoSaveGate.ts';

/* ------------------------------------------------------------------ */
/*  Factories                                                           */
/* ------------------------------------------------------------------ */

function makeAutoSaveInput(overrides: Partial<AutoSaveGateInput> = {}): AutoSaveGateInput {
  return {
    autoSaveEnabled: true,
    dirty: true,
    payloadFingerprint: 'fp-new',
    lastSavedFingerprint: 'fp-old',
    lastAttemptFingerprint: 'fp-old',
    initialHydrationApplied: true,
    ...overrides,
  };
}

function makeHydrationInput(overrides: Partial<HydrationForceInput> = {}): HydrationForceInput {
  return {
    serverSettings: { llmModelPlan: 'gemini-2.5-flash' },
    dirty: false,
    initialHydrationApplied: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  shouldAutoSave                                                      */
/* ------------------------------------------------------------------ */

describe('shouldAutoSave', () => {

  // === Happy path ===

  it('returns true when all conditions met (hydrated, dirty, new fingerprint)', () => {
    strictEqual(shouldAutoSave(makeAutoSaveInput()), true);
  });

  // === Hydration gate (the critical fix) ===

  it('returns false when initialHydrationApplied is false', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({ initialHydrationApplied: false })),
      false,
    );
  });

  it('returns false when initialHydrationApplied is false even if everything else is true', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        autoSaveEnabled: true,
        dirty: true,
        payloadFingerprint: 'fp-changed',
        lastSavedFingerprint: '',
        lastAttemptFingerprint: '',
        initialHydrationApplied: false,
      })),
      false,
    );
  });

  // === autoSaveEnabled gate ===

  it('returns false when autoSaveEnabled is false', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({ autoSaveEnabled: false })),
      false,
    );
  });

  // === dirty gate ===

  it('returns false when dirty is false', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({ dirty: false })),
      false,
    );
  });

  // === fingerprint gates ===

  it('returns false when payloadFingerprint is empty', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({ payloadFingerprint: '' })),
      false,
    );
  });

  it('returns false when payloadFingerprint matches lastSavedFingerprint', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        payloadFingerprint: 'fp-same',
        lastSavedFingerprint: 'fp-same',
      })),
      false,
    );
  });

  it('returns false when payloadFingerprint matches lastAttemptFingerprint', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        payloadFingerprint: 'fp-same',
        lastAttemptFingerprint: 'fp-same',
      })),
      false,
    );
  });

  // === Combination: hydration false + dirty false ===

  it('returns false when both hydration and dirty are false', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        initialHydrationApplied: false,
        dirty: false,
      })),
      false,
    );
  });

  // === Edge: all fingerprints empty ===

  it('returns false when all fingerprints are empty strings', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        payloadFingerprint: '',
        lastSavedFingerprint: '',
        lastAttemptFingerprint: '',
      })),
      false,
    );
  });

  // === Edge: fingerprint differs from saved but matches attempt ===

  it('returns false when fingerprint differs from saved but matches attempt', () => {
    strictEqual(
      shouldAutoSave(makeAutoSaveInput({
        payloadFingerprint: 'fp-new',
        lastSavedFingerprint: 'fp-old',
        lastAttemptFingerprint: 'fp-new',
      })),
      false,
    );
  });

  // === Table-driven: every single gate blocks independently ===

  const gateTests: { name: string; override: Partial<AutoSaveGateInput> }[] = [
    { name: 'autoSaveEnabled=false blocks', override: { autoSaveEnabled: false } },
    { name: 'dirty=false blocks', override: { dirty: false } },
    { name: 'empty fingerprint blocks', override: { payloadFingerprint: '' } },
    { name: 'hydration=false blocks', override: { initialHydrationApplied: false } },
    { name: 'fingerprint=lastSaved blocks', override: { payloadFingerprint: 'fp-old', lastSavedFingerprint: 'fp-old' } },
    { name: 'fingerprint=lastAttempt blocks', override: { payloadFingerprint: 'fp-old', lastAttemptFingerprint: 'fp-old' } },
  ];

  for (const { name, override } of gateTests) {
    it(`gate: ${name}`, () => {
      strictEqual(shouldAutoSave(makeAutoSaveInput(override)), false);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  shouldFlushOnUnmount                                                */
/* ------------------------------------------------------------------ */

function makeUnmountFlushInput(overrides: Partial<UnmountFlushGateInput> = {}): UnmountFlushGateInput {
  return {
    alreadyFlushedByUnload: false,
    hadPendingTimer: true,
    enabled: true,
    dirty: true,
    autoSaveEnabled: true,
    payloadFingerprint: 'fp-new',
    lastSavedFingerprint: 'fp-old',
    lastAttemptFingerprint: 'fp-old',
    ...overrides,
  };
}

describe('shouldFlushOnUnmount', () => {

  // === Happy paths ===

  it('returns true when all conditions met and pending timer exists', () => {
    strictEqual(shouldFlushOnUnmount(makeUnmountFlushInput()), true);
  });

  it('returns true when no pending timer but attempt fingerprint differs', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({
        hadPendingTimer: false,
        lastAttemptFingerprint: 'fp-different',
      })),
      true,
    );
  });

  // === Gate: alreadyFlushedByUnload ===

  it('returns false when already flushed by unload handler', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({ alreadyFlushedByUnload: true })),
      false,
    );
  });

  // === Gate: enabled ===

  it('returns false when not enabled', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({ enabled: false })),
      false,
    );
  });

  // === Gate: dirty ===

  it('returns false when not dirty', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({ dirty: false })),
      false,
    );
  });

  // === Gate: autoSaveEnabled ===

  it('returns false when auto-save disabled', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({ autoSaveEnabled: false })),
      false,
    );
  });

  // === Gate: empty fingerprint ===

  it('returns false when fingerprint is empty', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({ payloadFingerprint: '' })),
      false,
    );
  });

  // === Gate: fingerprint matches lastSaved ===

  it('returns false when fingerprint matches lastSavedFingerprint', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({
        payloadFingerprint: 'same',
        lastSavedFingerprint: 'same',
      })),
      false,
    );
  });

  // === Gate: no timer + fp matches attempt ===

  it('returns false when no pending timer and fingerprint matches lastAttempt', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({
        hadPendingTimer: false,
        payloadFingerprint: 'fp-new',
        lastAttemptFingerprint: 'fp-new',
      })),
      false,
    );
  });

  // === Critical: has timer + fp matches attempt → true (interrupted debounce recovery) ===

  it('returns true when pending timer exists even if fingerprint matches lastAttempt', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({
        hadPendingTimer: true,
        payloadFingerprint: 'fp-new',
        lastAttemptFingerprint: 'fp-new',
      })),
      true,
    );
  });

  // === All flags false simultaneously ===

  it('returns false when all flags are false', () => {
    strictEqual(
      shouldFlushOnUnmount(makeUnmountFlushInput({
        enabled: false,
        dirty: false,
        autoSaveEnabled: false,
      })),
      false,
    );
  });

  // === Table-driven: each gate blocks independently ===

  const gateTests: { name: string; override: Partial<UnmountFlushGateInput> }[] = [
    { name: 'alreadyFlushedByUnload blocks', override: { alreadyFlushedByUnload: true } },
    { name: 'enabled=false blocks', override: { enabled: false } },
    { name: 'dirty=false blocks', override: { dirty: false } },
    { name: 'autoSaveEnabled=false blocks', override: { autoSaveEnabled: false } },
    { name: 'empty fingerprint blocks', override: { payloadFingerprint: '' } },
    { name: 'fingerprint=lastSaved blocks', override: { payloadFingerprint: 'fp-old', lastSavedFingerprint: 'fp-old' } },
    { name: 'no timer + fingerprint=lastAttempt blocks', override: { hadPendingTimer: false, payloadFingerprint: 'fp-new', lastAttemptFingerprint: 'fp-new' } },
  ];

  for (const { name, override } of gateTests) {
    it(`gate: ${name}`, () => {
      strictEqual(shouldFlushOnUnmount(makeUnmountFlushInput(override)), false);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  shouldForceHydration                                                */
/* ------------------------------------------------------------------ */

describe('shouldForceHydration', () => {

  // === First hydration: always force-apply ===

  it('returns true on first hydration even when not dirty', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({
        initialHydrationApplied: false,
        dirty: false,
      })),
      true,
    );
  });

  it('returns true on first hydration even when dirty (the critical fix)', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({
        initialHydrationApplied: false,
        dirty: true,
      })),
      true,
    );
  });

  // === After hydration: respect dirty flag ===

  it('returns true after hydration when not dirty (normal server refresh)', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({
        initialHydrationApplied: true,
        dirty: false,
      })),
      true,
    );
  });

  it('returns false after hydration when dirty (user editing, do not overwrite)', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({
        initialHydrationApplied: true,
        dirty: true,
      })),
      false,
    );
  });

  // === No server data ===

  it('returns false when serverSettings is null', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({ serverSettings: null })),
      false,
    );
  });

  it('returns false when serverSettings is undefined', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({ serverSettings: undefined })),
      false,
    );
  });

  it('returns false when serverSettings is null even on first hydration', () => {
    strictEqual(
      shouldForceHydration(makeHydrationInput({
        serverSettings: null,
        initialHydrationApplied: false,
        dirty: false,
      })),
      false,
    );
  });

  // === Table-driven: all 8 combinations of (serverSettings, dirty, hydrated) ===

  const comboTests: {
    server: boolean;
    dirty: boolean;
    hydrated: boolean;
    expected: boolean;
    label: string;
  }[] = [
    { server: false, dirty: false, hydrated: false, expected: false, label: 'no server, clean, first load' },
    { server: false, dirty: false, hydrated: true,  expected: false, label: 'no server, clean, hydrated' },
    { server: false, dirty: true,  hydrated: false, expected: false, label: 'no server, dirty, first load' },
    { server: false, dirty: true,  hydrated: true,  expected: false, label: 'no server, dirty, hydrated' },
    { server: true,  dirty: false, hydrated: false, expected: true,  label: 'has server, clean, first load' },
    { server: true,  dirty: false, hydrated: true,  expected: true,  label: 'has server, clean, hydrated' },
    { server: true,  dirty: true,  hydrated: false, expected: true,  label: 'has server, dirty, first load → FORCE' },
    { server: true,  dirty: true,  hydrated: true,  expected: false, label: 'has server, dirty, hydrated → respect dirty' },
  ];

  for (const { server, dirty, hydrated, expected, label } of comboTests) {
    it(`combo: ${label}`, () => {
      strictEqual(
        shouldForceHydration({
          serverSettings: server ? { llmModelPlan: 'test' } : null,
          dirty,
          initialHydrationApplied: hydrated,
        }),
        expected,
      );
    });
  }
});
