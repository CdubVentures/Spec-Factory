import { create } from 'zustand';
import { UI_SETTING_DEFAULTS } from './settingsManifest.ts';
import {
  readPersistedBool,
  readPersistedValue,
  writePersistedValue,
} from './uiStoreInternal.ts';

const RUNTIME_AUTOSAVE_KEY = 'indexlab-runtime-autosave';
const USER_TIMEZONE_KEY = 'ui:userTimezone';
const DATE_FORMAT_KEY = 'ui:dateFormat';
const STUDIO_AUTOSAVE_ALL_KEY = 'studio:autoSaveAllEnabled';
const STUDIO_AUTOSAVE_KEY = 'autoSaveEnabled';
const STUDIO_MAP_AUTOSAVE_KEY = 'autoSaveMapEnabled';

export const SF_TIMEZONE_OPTIONS = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'] as const;
export type SfTimezoneId = typeof SF_TIMEZONE_OPTIONS[number];
export const SF_DATE_FORMAT_OPTIONS = ['MM-DD-YY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD-MM-YY'] as const;
export type SfDateFormatId = typeof SF_DATE_FORMAT_OPTIONS[number];
export const DEFAULT_TIMEZONE: SfTimezoneId = 'America/Los_Angeles';
export const DEFAULT_DATE_FORMAT: SfDateFormatId = 'MM-DD-YY';

function coerceTimezone(raw: string): SfTimezoneId {
  return (SF_TIMEZONE_OPTIONS as readonly string[]).includes(raw) ? raw as SfTimezoneId : DEFAULT_TIMEZONE;
}
function coerceDateFormat(raw: string): SfDateFormatId {
  return (SF_DATE_FORMAT_OPTIONS as readonly string[]).includes(raw) ? raw as SfDateFormatId : DEFAULT_DATE_FORMAT;
}

interface StudioAutoSaveState {
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
}

function normalizeStudioAutoSaveState(state: StudioAutoSaveState): StudioAutoSaveState {
  const autoSaveAllEnabled = Boolean(state.autoSaveAllEnabled);
  const autoSaveMapEnabled = autoSaveAllEnabled ? true : Boolean(state.autoSaveMapEnabled);
  const autoSaveEnabled = autoSaveAllEnabled
    ? true
    : Boolean(state.autoSaveEnabled);
  return {
    autoSaveAllEnabled,
    autoSaveEnabled,
    autoSaveMapEnabled,
  };
}

function persistStudioAutoSaveState(state: StudioAutoSaveState): void {
  writePersistedValue(STUDIO_AUTOSAVE_ALL_KEY, String(state.autoSaveAllEnabled));
  writePersistedValue(STUDIO_AUTOSAVE_KEY, String(state.autoSaveEnabled));
  writePersistedValue(STUDIO_MAP_AUTOSAVE_KEY, String(state.autoSaveMapEnabled));
}

export interface UiSettingsState {
  userTimezone: SfTimezoneId;
  dateFormat: SfDateFormatId;
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  setUserTimezone: (tz: SfTimezoneId) => void;
  setDateFormat: (fmt: SfDateFormatId) => void;
  setAutoSaveAllEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoSaveMapEnabled: (v: boolean) => void;
  setRuntimeAutoSaveEnabled: (v: boolean) => void;
}

const initialStudioAutoSaveState = normalizeStudioAutoSaveState({
  autoSaveAllEnabled: readPersistedBool(STUDIO_AUTOSAVE_ALL_KEY, UI_SETTING_DEFAULTS.studioAutoSaveAllEnabled),
  autoSaveEnabled: readPersistedBool(STUDIO_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveEnabled),
  autoSaveMapEnabled: readPersistedBool(STUDIO_MAP_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveMapEnabled),
});
persistStudioAutoSaveState(initialStudioAutoSaveState);

const initialUserTimezone = coerceTimezone(readPersistedValue(USER_TIMEZONE_KEY));
const initialDateFormat = coerceDateFormat(readPersistedValue(DATE_FORMAT_KEY));

// WHY: Formatting (timezone, date format) and autosave-policy flags share a
// single concern — "how the user wants the UI to behave persistently" —
// distinct from theme (visuals) and category (data scope).
export const useUiSettingsStore = create<UiSettingsState>((set) => ({
  userTimezone: initialUserTimezone,
  dateFormat: initialDateFormat,
  autoSaveAllEnabled: initialStudioAutoSaveState.autoSaveAllEnabled,
  autoSaveEnabled: initialStudioAutoSaveState.autoSaveEnabled,
  autoSaveMapEnabled: initialStudioAutoSaveState.autoSaveMapEnabled,
  runtimeAutoSaveEnabled: readPersistedBool(RUNTIME_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled),
  setUserTimezone: (tz) => {
    writePersistedValue(USER_TIMEZONE_KEY, tz);
    set({ userTimezone: tz });
  },
  setDateFormat: (fmt) => {
    writePersistedValue(DATE_FORMAT_KEY, fmt);
    set({ dateFormat: fmt });
  },
  setAutoSaveAllEnabled: (v) =>
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: v,
        autoSaveEnabled: state.autoSaveEnabled,
        autoSaveMapEnabled: state.autoSaveMapEnabled,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return nextStudioAutoSaveState;
    }),
  setAutoSaveEnabled: (v) => {
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: state.autoSaveAllEnabled,
        autoSaveEnabled: v,
        autoSaveMapEnabled: state.autoSaveMapEnabled,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return {
        autoSaveEnabled: nextStudioAutoSaveState.autoSaveEnabled,
        autoSaveMapEnabled: nextStudioAutoSaveState.autoSaveMapEnabled,
      };
    });
  },
  setAutoSaveMapEnabled: (v) => {
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: state.autoSaveAllEnabled,
        autoSaveEnabled: state.autoSaveEnabled,
        autoSaveMapEnabled: v,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return {
        autoSaveEnabled: nextStudioAutoSaveState.autoSaveEnabled,
        autoSaveMapEnabled: nextStudioAutoSaveState.autoSaveMapEnabled,
      };
    });
  },
  setRuntimeAutoSaveEnabled: (v) => {
    writePersistedValue(RUNTIME_AUTOSAVE_KEY, String(v));
    set({ runtimeAutoSaveEnabled: v });
  },
}));
