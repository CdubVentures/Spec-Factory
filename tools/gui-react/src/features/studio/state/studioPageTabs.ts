export const STUDIO_TAB_IDS = [
  'mapping',
  'keys',
  'contract',
  'reports',
] as const;

export type StudioTabId = (typeof STUDIO_TAB_IDS)[number];
