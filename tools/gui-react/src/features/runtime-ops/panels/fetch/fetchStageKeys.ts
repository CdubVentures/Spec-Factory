export const FETCH_STAGE_KEYS = ['stealth', 'auto_scroll', 'dom_expansion', 'css_override'] as const;
export type FetchTabKey = (typeof FETCH_STAGE_KEYS)[number];
