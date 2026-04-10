// WHY: Legacy adapter — no runtime consumers. Retained for backward-compatible
// export contract (settingsSurfaceContracts.test.js asserts the export exists).
// The authority now persists immediately; this adapter is not used by any page.

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
}: RuntimeSettingsEditorAdapterOptions<TValues>): RuntimeSettingsEditorAdapterResult<TValues> {
  const [values, setValues] = useState<TValues>(bootstrapValues);
  const [dirty, setDirtyState] = useState(false);
  const [saveStatus, setSaveStatus] = useState<RuntimeEditorSaveStatus>({
    kind: 'idle',
    message: '',
  });

  const isValuesEqual = valuesEqual || defaultValuesEqual;
  const _payload = useMemo(() => payloadFromValues(values), [payloadFromValues, values]);

  const payloadFromValuesRef = useRef(payloadFromValues);
  payloadFromValuesRef.current = payloadFromValues;

  const {
    settings,
    isLoading,
    isSaving,
    reload,
    saveNow,
  } = useRuntimeSettingsAuthority({
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
    const force = shouldForceHydration({
      serverSettings: settings,
      dirty,
      initialHydrationApplied: Boolean(settings),
    });
    if (!force) return;
    hydrateFromSnapshot(settings);
  }, [dirty, hydrateFromSnapshot, settings]);

  const setDirty = useCallback((next: boolean) => {
    setDirtyState(next);
  }, []);

  const updateKey = useCallback(<K extends keyof TValues>(key: K, value: TValues[K]) => {
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      const nextPayload = payloadFromValuesRef.current(next);
      useRuntimeSettingsValueStore.getState().replaceValues(nextPayload);
      return next;
    });
    setDirtyState(true);
    saveNow();
  }, [saveNow]);

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
