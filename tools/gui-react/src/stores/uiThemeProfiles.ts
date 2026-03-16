export const SF_THEME_COLOR_PROFILES = ['light', 'sand', 'rose', 'arctic', 'arcade', 'felt', 'hightech', 'redline', 'metallic', 'dark', 'ember', 'forest', 'obsidian', 'slate', 'funhaus', 'nightclub', 'cosmos', 'shooters', 'wasteland'] as const;
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

const DARK_PROFILE_IDS: ReadonlySet<string> = new Set<string>(['dark', 'ember', 'forest', 'obsidian', 'slate', 'funhaus', 'nightclub', 'cosmos', 'shooters', 'wasteland']);

export const SF_LIGHT_THEME_PROFILES = SF_THEME_COLOR_PROFILES.filter(
  (id) => !DARK_PROFILE_IDS.has(id),
);

export const SF_DARK_THEME_PROFILES = SF_THEME_COLOR_PROFILES.filter(
  (id) => DARK_PROFILE_IDS.has(id),
);

export interface SfThemeColorMeta {
  label: string;
  swatchColors: [string, string, string];
}

export const SF_THEME_COLOR_META: Record<SfThemeColorProfileId, SfThemeColorMeta> = {
  light:    { label: 'Frost',    swatchColors: ['#f8fbff', '#eaf0ff', '#3b82f6'] },
  sand:     { label: 'Sand',     swatchColors: ['#faf8f2', '#f0e8d8', '#d4a853'] },
  rose:     { label: 'Rose',     swatchColors: ['#fdf5f8', '#f5e0eb', '#d4619b'] },
  arctic:   { label: 'Arctic',   swatchColors: ['#f4f8fb', '#dce6f0', '#0891b2'] },
  dark:     { label: 'Midnight', swatchColors: ['#0a1330', '#111f41', '#6366f1'] },
  ember:    { label: 'Ember',    swatchColors: ['#1a1410', '#2a2018', '#e8742a'] },
  forest:   { label: 'Forest',   swatchColors: ['#0c1a14', '#132e20', '#34d399'] },
  obsidian: { label: 'Obsidian', swatchColors: ['#050506', '#161618', '#ec4899'] },
  slate:    { label: 'Slate',    swatchColors: ['#0f1117', '#1e2535', '#38bdf8'] },
  arcade:   { label: 'Arcade',   swatchColors: ['#f3f7f3', '#edf5ed', '#2ecc40'] },
  funhaus:  { label: 'Funhaus',  swatchColors: ['#1a2840', '#1e3050', '#ff6b6b'] },
  felt:     { label: 'Felt',     swatchColors: ['#f6f3eb', '#f2ece0', '#228b54'] },
  nightclub:{ label: 'Nightclub',swatchColors: ['#141418', '#1a1a20', '#00bcbc'] },
  hightech: { label: 'Hightech', swatchColors: ['#eceef0', '#e4e8ec', '#e67e22'] },
  cosmos:   { label: 'Cosmos',   swatchColors: ['#060a16', '#0a1220', '#3498db'] },
  redline:  { label: 'Redline',  swatchColors: ['#f8f8fa', '#f4f5f8', '#dc2626'] },
  shooters: { label: 'Shooters', swatchColors: ['#0c0c0c', '#121212', '#cc7832'] },
  metallic: { label: 'Metallic', swatchColors: ['#eff0f2', '#e8eaee', '#f39c12'] },
  wasteland:{ label: 'Wasteland',swatchColors: ['#0a0c06', '#10140a', '#a4c639'] },
};

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
  return DARK_PROFILE_IDS.has(value);
}
