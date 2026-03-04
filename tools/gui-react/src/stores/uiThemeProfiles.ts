export const SF_THEME_COLOR_PROFILES = ['light', 'dark'] as const;
export const SF_THEME_RADIUS_PROFILES = ['tight', 'standard', 'relaxed', 'pill-heavy'] as const;
export const SF_THEME_DENSITY_PROFILES = ['standard'] as const;

export type SfThemeColorProfileId = (typeof SF_THEME_COLOR_PROFILES)[number];
export type SfThemeRadiusProfileId = (typeof SF_THEME_RADIUS_PROFILES)[number];
export type SfThemeDensityProfileId = (typeof SF_THEME_DENSITY_PROFILES)[number];

export interface SfThemeProfile {
  color: SfThemeColorProfileId;
  radius: SfThemeRadiusProfileId;
  density?: SfThemeDensityProfileId;
}

export const DEFAULT_SF_THEME_PROFILE: Required<SfThemeProfile> = {
  color: 'light',
  radius: 'standard',
  density: 'standard',
};

const colorSet = new Set<string>(SF_THEME_COLOR_PROFILES);
const radiusSet = new Set<string>(SF_THEME_RADIUS_PROFILES);
const densitySet = new Set<string>(SF_THEME_DENSITY_PROFILES);

function toNormalizedText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function coerceThemeColorProfile(
  value: unknown,
  fallback: SfThemeColorProfileId = DEFAULT_SF_THEME_PROFILE.color,
): SfThemeColorProfileId {
  const normalized = toNormalizedText(value);
  return colorSet.has(normalized) ? (normalized as SfThemeColorProfileId) : fallback;
}

export function coerceThemeRadiusProfile(
  value: unknown,
  fallback: SfThemeRadiusProfileId = DEFAULT_SF_THEME_PROFILE.radius,
): SfThemeRadiusProfileId {
  const normalized = toNormalizedText(value);
  return radiusSet.has(normalized) ? (normalized as SfThemeRadiusProfileId) : fallback;
}

export function coerceThemeDensityProfile(
  value: unknown,
  fallback: SfThemeDensityProfileId = DEFAULT_SF_THEME_PROFILE.density,
): SfThemeDensityProfileId {
  const normalized = toNormalizedText(value);
  return densitySet.has(normalized) ? (normalized as SfThemeDensityProfileId) : fallback;
}

export function isDarkThemeColorProfile(value: SfThemeColorProfileId): boolean {
  return value === 'dark';
}

