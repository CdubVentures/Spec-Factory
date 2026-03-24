import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  useRuntimeSettingsAuthority,
  type RuntimeSettings,
} from './runtimeSettingsAuthority.ts';
import { shouldForceHydration } from './settingsAutoSaveGate.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';

type RuntimeEditorSaveStatusKind = 'idle' | 'ok' | 'partial' | 'error';

export interface RuntimeEditorSaveStatus {
  kind: RuntimeEditorSaveStatusKind;
  message: string;
}

interface RuntimeSettingsEditorAdapterOptions<TValues extends object> {
  bootstrapValues: TValues;
  payloadFromValues: (values: TValues) => RuntimeSettings;
  normalizeSnapshot: (
    snapshot: RuntimeSettings | undefined,
    bootstrapValues: TValues,
  ) => TValues;
  valuesEqual?: (a: TValues, b: TValues) => boolean;
  autoSaveEnabled: boolean;
}

interface RuntimeSettingsEditorAdapterResult<TValues extends object> {
  values: TValues;
  setValues: Dispatch<SetStateAction<TValues>>;
  dirty: boolean;
  setDirty: (next: boolean) => void;
  saveStatus: RuntimeEditorSaveStatus;
  isSaving: boolean;
  isLoading: boolean;
  settings: RuntimeSettings | undefined;
  reload: () => Promise<RuntimeSettings | undefined>;
  saveNow: () => void;
  updateKey: <K extends keyof TValues>(key: K, value: TValues[K]) => void;
  hydrateFromSnapshot: (snapshot: RuntimeSettings | undefined) => void;
}

function defaultValuesEqual<TValues extends object>(a: TValues, b: TValues) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useRuntimeSettingsEditorAdapter<TValues extends object>({
  bootstrapValues,
  payloadFromValues,
  normalizeSnapshot,
  valuesEqual,
  autoSaveEnabled,
}: RuntimeSettingsEditorAdapterOptions<TValues>): RuntimeSettingsEditorAdapterResult<TValues> {
  const [values, setValues] = useState<TValues>(bootstrapValues);
  const [dirty, setDirtyState] = useState(false);
  const [saveStatus, setSaveStatus] = useState<RuntimeEditorSaveStatus>({
    kind: 'idle',
    message: '',
  });
  // WHY: Tracks whether the first server response has been applied to the
  // editor. Auto-save is blocked until this is true, preventing the race where
  // a user edits a field before hydration completes and the auto-save sends
  // defaults instead of the user's previously saved settings.
  const initialHydrationAppliedRef = useRef(false);

  const isValuesEqual = valuesEqual || defaultValuesEqual;
  const payload = useMemo(() => payloadFromValues(values), [payloadFromValues, values]);

  // WHY: Ref to payloadFromValues so updateKey can push to the Zustand store
  // synchronously (not via a deferred effect). This makes the store SSOT — every
  // consumer sees the new value immediately, not on the next render cycle.
  const payloadFromValuesRef = useRef(payloadFromValues);
  payloadFromValuesRef.current = payloadFromValues;

  const {
    settings,
    isLoading,
    isSaving,
    reload,
    saveNow,
  } = useRuntimeSettingsAuthority({
    payload,
    dirty,
    autoSaveEnabled,
    initialHydrationApplied: initialHydrationAppliedRef.current,
    onPersisted: (result) => {
      if (result.ok) {
        setDirtyState(false);
        setSaveStatus({ kind: 'ok', message: 'Runtime settings saved.' });
        return;
      }
      setSaveStatus({ kind: 'error', message: 'Runtime settings save failed.' });
    },
    onError: (error) => {
      setSaveStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Runtime settings save failed.',
      });
    },
  });

  const hydrateFromSnapshot = useCallback((snapshot: RuntimeSettings | undefined) => {
    const nextValues = normalizeSnapshot(snapshot, bootstrapValues);
    setValues((previous) => (
      isValuesEqual(previous, nextValues) ? previous : nextValues
    ));
    setDirtyState(false);
  }, [bootstrapValues, isValuesEqual, normalizeSnapshot]);

  useEffect(() => {
    if (dirty) return;
    setValues((previous) => (
      isValuesEqual(previous, bootstrapValues) ? previous : bootstrapValues
    ));
  }, [bootstrapValues, dirty, isValuesEqual]);

  useEffect(() => {
    // WHY: shouldForceHydration ensures the first server response ALWAYS
    // applies (even if user set dirty=true prematurely). After initial
    // hydration, the normal dirty-gate applies: server data only refreshes
    // when the user has no pending edits.
    const force = shouldForceHydration({
      serverSettings: settings,
      dirty,
      initialHydrationApplied: initialHydrationAppliedRef.current,
    });
    if (!force) return;
    initialHydrationAppliedRef.current = true;
    hydrateFromSnapshot(settings);
  }, [dirty, hydrateFromSnapshot, settings]);

  const setDirty = useCallback((next: boolean) => {
    setDirtyState(next);
  }, []);

  const updateKey = useCallback(<K extends keyof TValues>(key: K, value: TValues[K]) => {
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      // WHY: Push to the Zustand store synchronously so all consumers (IndexingPage,
      // mutations, etc.) see the new value immediately — not after a deferred effect.
      // The store is the SSOT; local state is the view-specific draft shape.
      const nextPayload = payloadFromValuesRef.current(next);
      useRuntimeSettingsValueStore.getState().replaceValues(nextPayload);
      return next;
    });
    setDirtyState(true);
  }, []);

  return {
    values,
    setValues,
    dirty,
    setDirty,
    saveStatus,
    isSaving,
    isLoading,
    settings,
    reload,
    saveNow,
    updateKey,
    hydrateFromSnapshot,
  };
}
