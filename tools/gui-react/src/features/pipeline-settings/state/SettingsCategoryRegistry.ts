// WHY: Single source of truth for pipeline settings categories and sub-tabs.
// Adding a new category or section = one entry here. O(1) scaling.
// Pattern mirrors PREFETCH_STAGE_REGISTRY.

export type SettingsCategoryId = 'flow' | 'planner' | 'fetcher' | 'extraction' | 'validation';

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

export const SETTINGS_CATEGORY_KEYS = ['flow', 'planner', 'fetcher', 'extraction', 'validation'] as const;

export const SETTINGS_CATEGORY_REGISTRY: readonly SettingsCategoryDef[] = Object.freeze([
  {
    id: 'flow',
    label: 'Runtime Flow',
    subtitle: 'Run setup, timeouts, budgets, resume, output config',
    sections: Object.freeze([
      { id: 'timeout', label: 'Run Timeout', tip: 'Maximum run duration and deadline controls' },
      { id: 'resume', label: 'Resume', tip: 'Resume mode, window, and seed limits' },
      { id: 'output', label: 'Output', tip: 'Output destinations and artifact controls' },
      { id: 'cloud', label: 'Cloud & S3', tip: 'AWS region, S3 bucket, and mirror settings' },
      { id: 'storage', label: 'Storage', tip: 'Local database and frontier paths' },
      { id: 'automation', label: 'Automation', tip: 'Category authority and helper file config' },
      { id: 'observability', label: 'Observability', tip: 'Trace, events, and screencast capture' },
    ]),
  },
  {
    id: 'planner',
    label: 'Runtime Planner',
    subtitle: 'Discovery, search engines, query caps, NeedSet tuning',
    sections: Object.freeze([
      { id: 'discovery', label: 'Discovery', tip: 'Master toggle and provider selection' },
      { id: 'engines', label: 'Search Engines', tip: 'Engine selection, fallbacks, and provider config', customComponent: 'PlannerEnginesSection' },
      { id: 'budgets', label: 'URL Budgets', tip: 'Query caps, URL limits, domain caps' },
      { id: 'planner-llm', label: 'Planner LLM', tip: 'LLM retry and enhancement settings' },
      { id: 'network', label: 'Network', tip: 'User agent and network identity' },
    ]),
  },
  {
    id: 'fetcher',
    label: 'Runtime Fetcher',
    subtitle: 'Throughput, frontier, browser, screenshots, pacing',
    sections: Object.freeze([
      { id: 'throughput', label: 'Throughput', tip: 'Concurrency, delays, and timeout tuning' },
      { id: 'frontier', label: 'Frontier', tip: 'Frontier DB path, cooldowns, and repair rules' },
      { id: 'cooldowns', label: 'Cooldowns', tip: 'Per-status-code cooldown durations and backoff' },
      { id: 'browser', label: 'Browser', tip: 'Headless mode, scroll, robots.txt compliance' },
      { id: 'screenshots', label: 'Screenshots', tip: 'Page capture format, quality, and selectors' },
    ]),
  },
  {
    id: 'extraction',
    label: 'Runtime Extraction',
    subtitle: 'LLM providers, models, tokens, budgets',
    sections: Object.freeze([
      { id: 'provider', label: 'Provider', tip: 'LLM provider selection and base URLs' },
      { id: 'api-keys', label: 'API Keys', tip: 'Provider API keys (stored securely)' },
      { id: 'models', label: 'Models', tip: 'Model selection for plan, reasoning, and fallbacks' },
      { id: 'tokens', label: 'Tokens', tip: 'Max output tokens per model and phase' },
      { id: 'reasoning', label: 'Reasoning', tip: 'Reasoning mode and plan-level reasoning toggle' },
      { id: 'limits', label: 'Limits', tip: 'Call limits per product/round and timeout' },
      { id: 'budget', label: 'Budget', tip: 'Cost per token, monthly cap, per-product cap' },
      { id: 'cache', label: 'Cache', tip: 'Extraction cache directory' },
      { id: 'advanced', label: 'Advanced', tip: 'Phase overrides JSON and provider registry' },
    ]),
  },
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
