// WHY: Single source of truth for pipeline settings categories and sub-tabs.
// Adding a new category or section = one entry here. O(1) scaling.
// Pattern mirrors PREFETCH_STAGE_REGISTRY.
//
// Extraction-category sections are DERIVED from EXTRACTION_SECTION_META
// (codegen'd from src/core/config/runtimeStageDefs.js). Adding a new
// extraction plugin does NOT touch this file — add to runtimeStageDefs.js
// and the section auto-surfaces here.

import {
  EXTRACTION_SECTION_META,
  EXTRACTION_SECTION_ORDER,
} from '../../runtime-ops/panels/extraction/extractionStageKeys.generated.ts';

// WHY: LLM/extraction settings are owned by the LLM Config page (dedicated rich UI).
// Pipeline Settings covers global, planner, fetcher, extraction (screenshots), and validation.
export type SettingsCategoryId = 'review-publisher' | 'global' | 'discovery' | 'planner' | 'fetcher' | 'extraction' | 'validation' | 'module-global';

export interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly tip: string;
  /** When set, CategoryPanel renders this named component instead of GenericSectionPanel */
  readonly customComponent?: string;
  /** Fetch plugin lifecycle phase — drives the badge icon next to the label */
  readonly phase?: 'pre-load' | 'suite' | 'scroll';
  /** Optional inline SVG path (d attribute) — overrides CategoryPanel iconPaths table */
  readonly iconPath?: string;
}

// Derived from EXTRACTION_SECTION_META + EXTRACTION_SECTION_ORDER.
// null → undefined normalization keeps optional-field semantics consistent
// with hand-written section defs elsewhere in this file.
const EXTRACTION_SECTIONS: readonly SettingsSectionDef[] = Object.freeze(
  EXTRACTION_SECTION_ORDER.map((id): SettingsSectionDef => {
    const m = EXTRACTION_SECTION_META[id];
    const def: SettingsSectionDef = { id: m.sectionId, label: m.label, tip: m.tip };
    if (m.customComponent) (def as { customComponent?: string }).customComponent = m.customComponent;
    if (m.iconPath) (def as { iconPath?: string }).iconPath = m.iconPath;
    return def;
  }),
);

export interface SettingsCategoryDef {
  readonly id: SettingsCategoryId;
  readonly label: string;
  readonly subtitle: string;
  readonly sections: readonly SettingsSectionDef[];
}

export const SETTINGS_CATEGORY_KEYS = ['review-publisher', 'global', 'discovery', 'planner', 'fetcher', 'extraction', 'validation', 'module-global'] as const;

export const SETTINGS_CATEGORY_REGISTRY: readonly SettingsCategoryDef[] = Object.freeze([
  {
    id: 'review-publisher',
    label: 'Candidate Validation',
    subtitle: 'Publish gates and quality controls',
    sections: Object.freeze([
      { id: 'publish-gate', label: 'Publisher', tip: 'Confidence threshold for auto-publishing candidates to product.json fields' },
      { id: 'reconcile', label: 'Reconcile', tip: 'Preview and apply threshold changes to existing published values', customComponent: 'PublisherReconcile' },
    ]),
  },
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
    id: 'discovery',
    label: 'Discovery',
    subtitle: 'URL and query cooldown windows for all discovery feeds',
    sections: Object.freeze([
      { id: 'cooldowns', label: 'Cooldowns', tip: 'How long URLs and queries remain in cooldown before rediscovery' },
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
      { id: 'browser', label: 'Browser & Crawlee', tip: 'Headless mode, robots.txt, Crawlee internals, and request timeouts' },
      { id: 'web-unlockers', label: 'Web Unlockers', tip: 'On-demand bot-detection bypass APIs — fires only when our fetch is blocked' },
      { id: 'observability', label: 'Observability', tip: 'Runtime trace, event diagnostics, and screencast capture' },
      { id: 'fetch-global', label: 'Fetch Global', tip: 'Loading delay, dismiss round count, and suite execution mode' },
      { id: 'stealth', label: 'Stealth', tip: 'Pre-load fingerprint injection — masks webdriver flag before page loads', phase: 'pre-load' as const },
      { id: 'cookie-consent', label: 'Cookie Consent', tip: 'Dismiss cookie/privacy consent banners each round', phase: 'suite' as const },
      { id: 'overlay-dismissal', label: 'Overlay Dismissal', tip: 'Dismiss non-cookie popups — newsletter signups, chat widgets, paywalls', phase: 'suite' as const },
      { id: 'dom-expansion', label: 'DOM Expansion', tip: 'Click expand/show-more buttons to reveal collapsed sections', phase: 'suite' as const },
      { id: 'css-override', label: 'CSS Override', tip: 'Force-display hidden elements via CSS injection', phase: 'suite' as const },
      { id: 'resource-blocker', label: 'Resource Blocker', tip: 'Abort image/font/media/tracker requests — major fetch speedup', phase: 'pre-load' as const },
      { id: 'auto-scroll', label: 'Auto Scroll', tip: 'Scroll passes between dismiss rounds to trigger lazy content', phase: 'scroll' as const },
    ]),
  },
  {
    id: 'extraction',
    label: 'Runtime Extraction',
    subtitle: 'Screenshots, video recording, and page capture',
    sections: EXTRACTION_SECTIONS,
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
  {
    id: 'module-global',
    label: 'Global',
    subtitle: 'Shared one-time module setup',
    sections: Object.freeze([
      { id: 'rmbg-model', label: 'RMBG Model', tip: 'One-time HuggingFace access for the background-removal model used by the Product Image Finder. Not read after the model weights are downloaded.', customComponent: 'RmbgModelSection' },
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
