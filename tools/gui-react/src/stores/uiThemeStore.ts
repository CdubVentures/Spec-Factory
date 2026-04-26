import { create } from 'zustand';
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
import {
  readPersistedBool,
  readPersistedValue,
  readPersistedLocal,
  writePersistedValue,
} from './uiStoreInternal.ts';

const DARK_MODE_KEY = 'ui:darkMode';
const THEME_COLOR_KEY = 'ui:themeColorProfile';
const THEME_RADIUS_KEY = 'ui:themeRadiusProfile';
const THEME_DENSITY_KEY = 'ui:themeDensityProfile';
const LAST_LIGHT_THEME_KEY = 'ui:lastLightTheme';
const LAST_DARK_THEME_KEY = 'ui:lastDarkTheme';

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
  const persisted = readPersistedLocal(key);
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

export interface UiThemeState {
  darkMode: boolean;
  themeColorProfile: SfThemeColorProfileId;
  themeRadiusProfile: SfThemeRadiusProfileId;
  themeDensityProfile: SfThemeDensityProfileId;
  setThemeProfile: (themeProfile: SfThemeProfile) => void;
  setThemeColorProfile: (themeColorProfile: SfThemeColorProfileId) => void;
  setThemeRadiusProfile: (themeRadiusProfile: SfThemeRadiusProfileId) => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
}

const initialThemeProfile = readPersistedThemeProfile();

// WHY: Theme state is purely visual — color/radius/density/darkMode. Split
// from category and autosave so theme-only consumers (AppShell appearance
// panel) don't subscribe to data-scope or settings churn.
export const useUiThemeStore = create<UiThemeState>((set) => ({
  ...toThemeState(initialThemeProfile),
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
}));
