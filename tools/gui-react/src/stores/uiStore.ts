import { create } from 'zustand';
import { coerceCategories, DEFAULT_CATEGORY } from '../utils/categoryStoreSync.js';
import { UI_SETTING_DEFAULTS } from './settingsManifest.ts';
import {
  DEFAULT_SF_THEME_PROFILE,
  coerceThemeColorProfile,
  coerceThemeDensityProfile,
  coerceThemeRadiusProfile,
  isDarkThemeColorProfile,
  type SfThemeColorProfileId,
  type SfThemeDensityProfileId,
  type SfThemeProfile,
  type SfThemeRadiusProfileId,
} from './uiThemeProfiles.ts';

const UI_CATEGORY_KEY = 'ui:selectedCategory';
const DARK_MODE_KEY = 'ui:darkMode';
const THEME_COLOR_KEY = 'ui:themeColorProfile';
const THEME_RADIUS_KEY = 'ui:themeRadiusProfile';
const THEME_DENSITY_KEY = 'ui:themeDensityProfile';
const RUNTIME_AUTOSAVE_KEY = 'indexlab-runtime-autosave';
const USER_TIMEZONE_KEY = 'ui:userTimezone';
const DATE_FORMAT_KEY = 'ui:dateFormat';

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

const STUDIO_AUTOSAVE_ALL_KEY = 'studio:autoSaveAllEnabled';
const STUDIO_AUTOSAVE_KEY = 'autoSaveEnabled';
const STUDIO_MAP_AUTOSAVE_KEY = 'autoSaveMapEnabled';
const LAST_LIGHT_THEME_KEY = 'ui:lastLightTheme';
const LAST_DARK_THEME_KEY = 'ui:lastDarkTheme';

function readPersistedBool(key: string, fallback: boolean): boolean {
  const value = readPersistedValue(key);
  if (!value) return fallback;
  return value === 'true';
}

function readLocalValue(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function readLegacySessionValue(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocalValue(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function clearLegacySessionValue(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function readPersistedValue(key: string): string {
  const local = readLocalValue(key);
  if (local) return local;
  const legacy = readLegacySessionValue(key);
  if (legacy) {
    writeLocalValue(key, legacy);
    clearLegacySessionValue(key);
  }
  return legacy;
}

function writePersistedValue(key: string, value: string): void {
  writeLocalValue(key, value);
  clearLegacySessionValue(key);
}

function setRootDataAttribute(attribute: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(attribute, value);
}

function normalizeThemeProfile(themeProfile: SfThemeProfile): Required<SfThemeProfile> {
  return {
    color: coerceThemeColorProfile(themeProfile.color, DEFAULT_SF_THEME_PROFILE.color),
    radius: coerceThemeRadiusProfile(themeProfile.radius, DEFAULT_SF_THEME_PROFILE.radius),
    density: coerceThemeDensityProfile(themeProfile.density, DEFAULT_SF_THEME_PROFILE.density),
  };
}

function applyThemeProfile(themeProfile: SfThemeProfile): Required<SfThemeProfile> {
  const normalizedProfile = normalizeThemeProfile(themeProfile);
  if (typeof document === 'undefined') return normalizedProfile;
  const isDark = isDarkThemeColorProfile(normalizedProfile.color);
  setRootDataAttribute('data-sf-theme', normalizedProfile.color);
  setRootDataAttribute('data-sf-theme-mode', isDark ? 'dark' : 'light');
  setRootDataAttribute('data-sf-radius', normalizedProfile.radius);
  setRootDataAttribute('data-sf-density', normalizedProfile.density);
  document.documentElement.classList.toggle('dark', isDark);
  return normalizedProfile;
}

function trackLastUsedTheme(colorProfile: SfThemeColorProfileId): void {
  if (isDarkThemeColorProfile(colorProfile)) {
    writePersistedValue(LAST_DARK_THEME_KEY, colorProfile);
  } else {
    writePersistedValue(LAST_LIGHT_THEME_KEY, colorProfile);
  }
}

function readLastUsedTheme(wantDark: boolean): SfThemeColorProfileId {
  const key = wantDark ? LAST_DARK_THEME_KEY : LAST_LIGHT_THEME_KEY;
  const fallback: SfThemeColorProfileId = wantDark ? 'dark' : 'light';
  const persisted = readLocalValue(key);
  return persisted ? coerceThemeColorProfile(persisted, fallback) : fallback;
}

function persistThemeProfile(themeProfile: Required<SfThemeProfile>): void {
  writePersistedValue(THEME_COLOR_KEY, themeProfile.color);
  writePersistedValue(THEME_RADIUS_KEY, themeProfile.radius);
  writePersistedValue(THEME_DENSITY_KEY, themeProfile.density);
  writePersistedValue(DARK_MODE_KEY, String(isDarkThemeColorProfile(themeProfile.color)));
}

function readPersistedThemeProfile(): Required<SfThemeProfile> {
  const legacyDarkMode = readPersistedBool(DARK_MODE_KEY, false);
  const persistedColor = readPersistedValue(THEME_COLOR_KEY);
  const persistedRadius = readPersistedValue(THEME_RADIUS_KEY);
  const persistedDensity = readPersistedValue(THEME_DENSITY_KEY);
  return normalizeThemeProfile({
    color: coerceThemeColorProfile(persistedColor, legacyDarkMode ? 'dark' : DEFAULT_SF_THEME_PROFILE.color),
    radius: coerceThemeRadiusProfile(persistedRadius, DEFAULT_SF_THEME_PROFILE.radius),
    density: coerceThemeDensityProfile(persistedDensity, DEFAULT_SF_THEME_PROFILE.density),
  });
}

function toThemeState(themeProfile: Required<SfThemeProfile>) {
  return {
    darkMode: isDarkThemeColorProfile(themeProfile.color),
    themeColorProfile: themeProfile.color,
    themeRadiusProfile: themeProfile.radius,
    themeDensityProfile: themeProfile.density,
  };
}

export function hydrateUiThemeProfile(): Required<SfThemeProfile> {
  const hydratedProfile = readPersistedThemeProfile();
  persistThemeProfile(hydratedProfile);
  applyThemeProfile(hydratedProfile);
  return hydratedProfile;
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

interface UiState {
  category: string;
  categories: string[];
  darkMode: boolean;
  themeColorProfile: SfThemeColorProfileId;
  themeRadiusProfile: SfThemeRadiusProfileId;
  themeDensityProfile: SfThemeDensityProfileId;
  userTimezone: SfTimezoneId;
  dateFormat: SfDateFormatId;
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  setCategory: (cat: string) => void;
  setCategories: (cats: string[]) => void;
  setThemeProfile: (themeProfile: SfThemeProfile) => void;
  setThemeColorProfile: (themeColorProfile: SfThemeColorProfileId) => void;
  setThemeRadiusProfile: (themeRadiusProfile: SfThemeRadiusProfileId) => void;
  setUserTimezone: (tz: SfTimezoneId) => void;
  setDateFormat: (fmt: SfDateFormatId) => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
  setAutoSaveAllEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoSaveMapEnabled: (v: boolean) => void;
  setRuntimeAutoSaveEnabled: (v: boolean) => void;
}

const initialCategory = readPersistedValue(UI_CATEGORY_KEY) || DEFAULT_CATEGORY;
const initialThemeProfile = readPersistedThemeProfile();
const initialStudioAutoSaveState = normalizeStudioAutoSaveState({
  autoSaveAllEnabled: readPersistedBool(STUDIO_AUTOSAVE_ALL_KEY, UI_SETTING_DEFAULTS.studioAutoSaveAllEnabled),
  autoSaveEnabled: readPersistedBool(STUDIO_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveEnabled),
  autoSaveMapEnabled: readPersistedBool(STUDIO_MAP_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveMapEnabled),
});
persistStudioAutoSaveState(initialStudioAutoSaveState);

const initialUserTimezone = coerceTimezone(readPersistedValue(USER_TIMEZONE_KEY));
const initialDateFormat = coerceDateFormat(readPersistedValue(DATE_FORMAT_KEY));

export const useUiStore = create<UiState>((set) => ({
  category: initialCategory,
  categories: coerceCategories(['mouse']),
  ...toThemeState(initialThemeProfile),
  userTimezone: initialUserTimezone,
  dateFormat: initialDateFormat,
  autoSaveAllEnabled: initialStudioAutoSaveState.autoSaveAllEnabled,
  autoSaveEnabled: initialStudioAutoSaveState.autoSaveEnabled,
  autoSaveMapEnabled: initialStudioAutoSaveState.autoSaveMapEnabled,
  runtimeAutoSaveEnabled: readPersistedBool(RUNTIME_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled),
  setCategory: (category) => {
    writePersistedValue(UI_CATEGORY_KEY, category);
    set({ category });
  },
  setCategories: (categories) => set({ categories: coerceCategories(categories) }),
  setThemeProfile: (themeProfile) => {
    const nextThemeProfile = applyThemeProfile(themeProfile);
    persistThemeProfile(nextThemeProfile);
    set({ ...toThemeState(nextThemeProfile) });
  },
  setThemeColorProfile: (themeColorProfile) =>
    set((state) => {
      const nextThemeProfile = applyThemeProfile({
        color: themeColorProfile,
        radius: state.themeRadiusProfile,
        density: state.themeDensityProfile,
      });
      persistThemeProfile(nextThemeProfile);
      trackLastUsedTheme(nextThemeProfile.color);
      return { ...toThemeState(nextThemeProfile) };
    }),
  setThemeRadiusProfile: (themeRadiusProfile) =>
    set((state) => {
      const nextThemeProfile = applyThemeProfile({
        color: state.themeColorProfile,
        radius: themeRadiusProfile,
        density: state.themeDensityProfile,
      });
      persistThemeProfile(nextThemeProfile);
      return { ...toThemeState(nextThemeProfile) };
    }),
  setDarkMode: (darkMode) => {
    const nextColorProfile = readLastUsedTheme(Boolean(darkMode));
    set((state) => {
      const nextThemeProfile = applyThemeProfile({
        color: nextColorProfile,
        radius: state.themeRadiusProfile,
        density: state.themeDensityProfile,
      });
      persistThemeProfile(nextThemeProfile);
      return { ...toThemeState(nextThemeProfile) };
    });
  },
  toggleDarkMode: () =>
    set((state) => {
      const nextColorProfile = readLastUsedTheme(!state.darkMode);
      const nextThemeProfile = applyThemeProfile({
        color: nextColorProfile,
        radius: state.themeRadiusProfile,
        density: state.themeDensityProfile,
      });
      persistThemeProfile(nextThemeProfile);
      return { ...toThemeState(nextThemeProfile) };
    }),
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
  setUserTimezone: (tz) => {
    writePersistedValue(USER_TIMEZONE_KEY, tz);
    set({ userTimezone: tz });
  },
  setDateFormat: (fmt) => {
    writePersistedValue(DATE_FORMAT_KEY, fmt);
    set({ dateFormat: fmt });
  },
}));
