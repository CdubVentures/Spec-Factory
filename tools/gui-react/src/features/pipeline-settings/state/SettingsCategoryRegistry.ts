// WHY: Single source of truth for pipeline settings categories and sub-tabs.
// Adding a new category or section = one entry here. O(1) scaling.
// Pattern mirrors PREFETCH_STAGE_REGISTRY.

// WHY: LLM/extraction settings are owned by the LLM Config page (dedicated rich UI).
// Pipeline Settings covers global, planner, fetcher, extraction (screenshots), and validation.
export type SettingsCategoryId = 'global' | 'planner' | 'fetcher' | 'extraction' | 'validation';

export interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly tip: string;
  /** When set, CategoryPanel renders this named component instead of GenericSectionPanel */
  readonly customComponent?: string;
  /** When true, section button shows a small plug icon badge */
  readonly isPlugin?: boolean;
}

export interface SettingsCategoryDef {
  readonly id: SettingsCategoryId;
  readonly label: string;
  readonly subtitle: string;
  readonly sections: readonly SettingsSectionDef[];
}

export const SETTINGS_CATEGORY_KEYS = ['global', 'planner', 'fetcher', 'extraction', 'validation'] as const;

export const SETTINGS_CATEGORY_REGISTRY: readonly SettingsCategoryDef[] = Object.freeze([
  {
    id: 'global',
    label: 'Global',
    subtitle: 'Run setup, timeouts, output config',
    sections: Object.freeze([
      { id: 'run-setup', label: 'Run Setup & Limits', tip: 'Run timeout and execution limits' },
      { id: 'output', label: 'Output & Automation', tip: 'Output destinations, artifact controls, and category authority' },
    ]),
  },
  {
    id: 'planner',
    label: 'Runtime Planner',
    subtitle: 'Pipeline phase settings: NeedSet through Domain Classifier',
    sections: Object.freeze([
      { id: 'tier-hierarchy', label: 'Tier Hierarchy', tip: 'Drag-and-drop query generation priority for Tier 1 seeds', customComponent: 'TierHierarchy' },
      { id: 'needset', label: 'NeedSet', tip: 'Confidence thresholds, focus field caps, and group query term limits' },
      { id: 'search-profile', label: 'Search Profile', tip: 'Query cap, alias limits, field query caps, and synonym limits' },
      { id: 'search-planner', label: 'Search Planner', tip: 'LLM enhancer retry limits' },
      { id: 'search-execution', label: 'Search Execution', tip: 'Search engines, provider pacing, timeouts, retries, result caps, and loop control' },
      { id: 'serp-selector', label: 'SERP Selector', tip: 'URL cap for LLM-based SERP selection' },
      { id: 'domain-classifier', label: 'Domain Classifier', tip: 'Domain URL cap and per-domain page limits' },
    ]),
  },
  {
    id: 'fetcher',
    label: 'Runtime Fetcher',
    subtitle: 'Fetch plugins, browser config, network, observability',
    sections: Object.freeze([
      { id: 'stealth', label: 'Stealth', tip: 'Anti-detection fingerprint injection', isPlugin: true },
      { id: 'cookie-consent', label: 'Cookie Consent', tip: 'Auto-dismiss cookie/privacy consent banners', isPlugin: true },
      { id: 'auto-scroll', label: 'Auto Scroll', tip: 'Scroll passes to trigger lazy-loaded content', isPlugin: true },
      { id: 'dom-expansion', label: 'DOM Expansion', tip: 'Click expand/show-more buttons to reveal collapsed sections', isPlugin: true },
      { id: 'css-override', label: 'CSS Override', tip: 'Force-display hidden elements via CSS injection', isPlugin: true },
      { id: 'capture', label: 'Capture & Recording', tip: 'Video recording settings for fetch worker playback' },
      { id: 'browser', label: 'Browser & Crawlee', tip: 'Headless mode, robots.txt, Crawlee internals, and request timeouts' },
      { id: 'observability', label: 'Observability', tip: 'Runtime trace, event diagnostics, and screencast capture' },
    ]),
  },
  {
    id: 'extraction',
    label: 'Runtime Extraction',
    subtitle: 'Screenshots and page capture',
    sections: Object.freeze([
      { id: 'screenshots', label: 'Screenshots', tip: 'Page capture format, quality, selectors, and size limits' },
    ]),
  },
  // WHY: LLM/extraction settings are managed by the dedicated LLM Config page
  // (tools/gui-react/src/features/llm-config/). Not duplicated here.
  {
    id: 'validation',
    label: 'Runtime Validation',
    subtitle: 'Schema enforcement and quality gates',
    sections: Object.freeze([
      { id: 'schema', label: 'Schema Enforcement', tip: 'Pipeline checkpoint validation mode' },
    ]),
  },
]);

/** Lookup a category definition by ID */
export function findCategory(id: SettingsCategoryId): SettingsCategoryDef | undefined {
  return SETTINGS_CATEGORY_REGISTRY.find((c) => c.id === id);
}

/** Lookup a section definition within a category */
export function findSection(categoryId: SettingsCategoryId, sectionId: string): SettingsSectionDef | undefined {
  return findCategory(categoryId)?.sections.find((s) => s.id === sectionId);
}
