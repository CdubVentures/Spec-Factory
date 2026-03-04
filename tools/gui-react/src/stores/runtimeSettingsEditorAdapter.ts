import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  useRuntimeSettingsAuthority,
  type RuntimeSettings,
} from './runtimeSettingsAuthority';

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

  const isValuesEqual = valuesEqual || defaultValuesEqual;
  const payload = useMemo(() => payloadFromValues(values), [payloadFromValues, values]);

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
    onPersisted: (result) => {
      if (result.ok) {
        setDirtyState(false);
        setSaveStatus({ kind: 'ok', message: 'Runtime settings saved.' });
        return;
      }
      const rejected = Object.keys(result.rejected);
      if (rejected.length > 0) {
        setSaveStatus({
          kind: 'partial',
          message: `Runtime settings partially saved. Rejected ${rejected.length} key(s).`,
        });
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
    if (!settings || dirty) return;
    hydrateFromSnapshot(settings);
  }, [dirty, hydrateFromSnapshot, settings]);

  const setDirty = useCallback((next: boolean) => {
    setDirtyState(next);
  }, []);

  const updateKey = useCallback(<K extends keyof TValues>(key: K, value: TValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
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
