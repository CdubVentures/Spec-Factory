// WHY: Single source of truth for pipeline settings categories and sub-tabs.
// Adding a new category or section = one entry here. O(1) scaling.
// Pattern mirrors PREFETCH_STAGE_REGISTRY.

// WHY: extraction settings are owned by the LLM Config page (dedicated rich UI).
// Pipeline Settings only covers flow, planner, fetcher, and validation.
export type SettingsCategoryId = 'flow' | 'planner' | 'fetcher' | 'validation';

export interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly tip: string;
  /** When set, CategoryPanel renders this named component instead of GenericSectionPanel */
  readonly customComponent?: string;
}

export interface SettingsCategoryDef {
  readonly id: SettingsCategoryId;
  readonly label: string;
  readonly subtitle: string;
  readonly sections: readonly SettingsSectionDef[];
}

export const SETTINGS_CATEGORY_KEYS = ['flow', 'planner', 'fetcher', 'validation'] as const;

export const SETTINGS_CATEGORY_REGISTRY: readonly SettingsCategoryDef[] = Object.freeze([
  {
    id: 'flow',
    label: 'Runtime Flow',
    subtitle: 'Run setup, timeouts, budgets, resume, output config',
    sections: Object.freeze([
      { id: 'run-setup', label: 'Run Setup & Limits', tip: 'Run timeout, resume mode, seed limits, and persist limits' },
      { id: 'output', label: 'Output & Automation', tip: 'Output destinations, artifact controls, and category authority' },
      { id: 'observability', label: 'Observability', tip: 'Runtime trace, event diagnostics, and screencast capture' },
    ]),
  },
  {
    id: 'planner',
    label: 'Runtime Planner',
    subtitle: 'Discovery, search engines, query caps, NeedSet tuning',
    sections: Object.freeze([
      { id: 'discovery', label: 'Discovery & Search', tip: 'Discovery toggle, search engine providers, proxy config, and planner LLM settings' },
      { id: 'budgets', label: 'Budgets & Caps', tip: 'Query caps, URL limits, domain limits, and per-product maximums' },
    ]),
  },
  {
    id: 'fetcher',
    label: 'Runtime Fetcher',
    subtitle: 'Throughput, frontier, browser, screenshots, pacing',
    sections: Object.freeze([
      { id: 'network', label: 'Network & Pacing', tip: 'Concurrency, host delays, frontier cooldowns, repair rules, and backoff config' },
      { id: 'browser', label: 'Browser & Rendering', tip: 'Headless mode, auto-scroll, robots.txt compliance, and request timeouts' },
      { id: 'screenshots', label: 'Screenshots', tip: 'Page capture format, quality, selectors, and size limits' },
    ]),
  },
  // WHY: extraction/LLM settings are managed by the dedicated LLM Config page
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
